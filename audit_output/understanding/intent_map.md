# Intent map

Generated: 2026-11-24T23:54:16.343905+00:00

## Architecture

Max Booster is a TypeScript monorepo (Express API server, React/Vite client, shared schema) deployed on Replit with Neon Postgres. A Redis-compatible layer (PDIM) provides cache/state. Python-based MaxCore AI services sit beside it, including a software 'digital GPU' that emulates CUDA in NumPy behind an abstract Backend interface. Node .mjs scripts handle deployment scheduling, portable Python provisioning, DB recovery drills and sealed acceptance harnesses. The client holds batch/bulk-action hooks, shortcut hooks, a11y helpers and a video template compiler. The server holds Stripe, SSRF-safe fetch and Postgres-tool helpers. This synthesis comes from module summaries only; I did not inspect function bodies, so the statuses below reflect those summaries.

## Features

- **CUDA emulation runtime (digital GPU)** [complete]: NumPy emulation of CUDA execution: dim3, per-block shared memory, warp shuffle/reduce, atomics, math and fp16 intrinsics, and a per-block CUDARuntime context for SM102 kernels. It appears in several duplicated copies of the repo tree. (external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py)
- **Abstract compute Backend interface** [complete]: ABC defining primitive kernels (create_tensor, gemm, add, relu, softmax, attention, conv2d, mlp, reduce) plus defaults, which every DigitalGPU backend must implement. (external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py)
- **Future backends (cluster/ASIC) plug-points** [partial]: Deliberately non-functional backends that report is_available()=False and raise NotImplementedError with a documented contract. This is an intentional stub, not a defect. (external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py)
- **AI director analytics feedback loop** [complete]: PerformanceRecord dataclass, a pluggable AnalyticsSource protocol with JSONL file and PDIM-backed implementations, feeding observed engagement back to the director. (external/maxcore/artifacts/ai-training-server/ai_model/director/analytics.py)
- **Advanced video renderer orchestration** [complete]: Generates hook/body/CTA copy and sentiment, submits sync or async video jobs to the MaxCore AI server and polls for results. (AI enhancements/advancedVideoRendererService.ts)
- **Batch/bulk action client hooks** [complete]: Three overlapping React hook libraries (useBatchAction, useBatchActions, useBulkAction) that run bulk operations against /api/batch/{resource}/{action} with confirm/execute/progress/result state machines. The overlap suggests duplication. (client/src/hooks/useBatchAction.ts, client/src/hooks/useBatchActions.ts, client/src/hooks/useBulkAction.ts)
- **Module keyboard shortcuts** [complete]: Hook that registers per-module shortcut tables (studio, analytics, social, distribution, marketplace) with ShortcutContext. (client/src/hooks/useModuleShortcuts.ts)
- **Accessibility focus and keyboard utilities** [complete]: Focus save/restore with a stack manager, focus movement, a modal focus trap, roving tabindex, Escape handler and arrow-key navigation. (client/src/lib/a11y/focus.ts, client/src/lib/a11y/keyboard.ts)
- **Promo video template compiler** [complete]: Compiles promo template options (release, tour, bts, quote, countdown, split, teaser) into a renderer-ready VideoProject. (client/src/lib/video/TemplateCompiler.ts)
- **Deployment executive scheduler** [complete]: Dependency-aware, resource-admitting DAG scheduler for the build and start phases, including plan validation and build-phase ordering edges. (script/deployment/executive.mjs)
- **Portable Python provisioning** [complete]: Provisions a pinned python-build-standalone CPython into python_runtime, reusing a verified existing runtime or downloading a new one. (script/lib/provisionPortablePython.mjs)
- **Database recovery drill** [complete]: Takes a repeatable-read snapshot of the Neon primary, runs pg_dump at the exported snapshot, optionally retains the dump, and verifies recovery. (scripts/database-recovery-drill.mjs)
- **Sealed acceptance and runtime test harnesses** [complete]: Env-scrubbed acceptance drills (readiness, page80) and a mocked data-runtime boundary test, all built with esbuild bundling. (scripts/readiness-assembled-acceptance.mjs, scripts/testing/page80-acceptance.mjs, scripts/test-data-runtime.mjs)
- **Stripe client helper** [complete]: Resolves environment-appropriate Stripe keys, validates credential shape, and lazily builds and caches a client. (server/lib/stripeClient.ts)
- **Postgres client tool selection** [complete]: Locates pg_dump and psql on PATH, probes their versions against the server major version, and picks compatible binaries, passing credentials via libpq env vars. (server/services/backup/postgresTools.ts)
- **SSRF-safe URL fetch** [complete]: Validates public http(s) URLs, blocks private/reserved IPs including at connect time via a custom DNS lookup (closing DNS rebinding), with size, time and redirect limits. (server/services/safeUrlFetch.ts)
- **Bundled cluster fixture** [unclear]: esbuild-bundled test fixture inlining server code (log sanitization, PDIM/Redis-compatible client) in a temp cluster-test directory. It is a generated artifact, not source. (.task123-publishing-candidate/.pdim-cluster-test-Pidv4k/cluster-fixture.mjs)

## Unfinished work

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend._nyi` [medium]: body is not_implemented
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend` [high]: model assessed as stub | missing: Nothing for its role as a deliberate placeholder. Concrete subclasses need real implementations.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.create_tensor` [high]: model assessed as stub | missing: A real device implementation in a concrete backend.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.gemm` [high]: model assessed as stub | missing: A real GEMM kernel in a concrete backend.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.add` [high]: model assessed as stub | missing: A real add kernel.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.relu` [high]: model assessed as stub | missing: A real ReLU kernel.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.softmax` [high]: model assessed as stub | missing: A real softmax kernel.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.attention` [high]: model assessed as stub | missing: A real attention kernel.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.conv2d` [high]: model assessed as stub | missing: A real conv2d kernel.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.mlp` [high]: model assessed as stub | missing: A real MLP kernel.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.reduce` [high]: model assessed as stub | missing: A real reduce kernel.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `ClusterBackend` [high]: model assessed as stub | missing: RPC-based graph partitioning, KV-cache sharding, all-reduce at barriers, and per-node device backends.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `ASICBackend` [high]: model assessed as stub | missing: IR-to-microcode lowering, DMA engine driving, on-chip KV-cache, and tensor unit support.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `<module-level>` [low]: docs claim: Cluster and ASIC backends in the MaxCore backend registry | missing: Cluster and ASIC backends in the MaxCore backend registry
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend._nyi` [medium]: body is not_implemented
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend` [high]: model assessed as stub | missing: Nothing for the base; real device backends must be implemented separately. It is intentionally a stub.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.create_tensor` [high]: model assessed as stub | missing: A real device backend must implement tensor creation.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.gemm` [high]: model assessed as stub | missing: Real GEMM kernel on the device.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.add` [high]: model assessed as stub | missing: Real add kernel.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.relu` [high]: model assessed as stub | missing: Real ReLU kernel.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.softmax` [high]: model assessed as stub | missing: Real softmax kernel.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.attention` [high]: model assessed as stub | missing: Real attention kernel.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.conv2d` [high]: model assessed as stub | missing: Real conv2d kernel.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.mlp` [high]: model assessed as stub | missing: Real MLP kernel.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.reduce` [high]: model assessed as stub | missing: Real reduce kernel.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `ClusterBackend` [high]: model assessed as stub | missing: RPC partitioning, KV-cache sharding, barrier all-reduce, and per-node device execution.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `ASICBackend` [high]: model assessed as stub | missing: IR-to-microcode lowering and the hardware drivers.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend._nyi` [medium]: body is not_implemented
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend` [high]: model assessed as stub | missing: Nothing by design. Concrete subclasses would need to override all the kernels and is_available() to become real.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.create_tensor` [high]: model assessed as stub | missing: A real device-specific tensor allocation in a concrete backend.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.gemm` [high]: model assessed as stub | missing: A real GEMM in a concrete backend.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.add` [high]: model assessed as stub | missing: A real elementwise add in a concrete backend.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.relu` [high]: model assessed as stub | missing: A real ReLU in a concrete backend.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.softmax` [high]: model assessed as stub | missing: A real softmax in a concrete backend.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.attention` [high]: model assessed as stub | missing: A real attention kernel in a concrete backend.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.conv2d` [high]: model assessed as stub | missing: A real conv2d in a concrete backend.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.mlp` [high]: model assessed as stub | missing: A real MLP kernel in a concrete backend.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.reduce` [high]: model assessed as stub | missing: A real reduce in a concrete backend.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `ClusterBackend` [medium]: model assessed as stub | missing: RPC layer, graph partitioning, KV-cache sharding, all-reduce at barriers, and per-node device backends.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `ASICBackend` [medium]: model assessed as stub | missing: IR-to-microcode lowering, DMA control, on-chip KV-cache, and tensor-unit drivers.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend._nyi` [medium]: body is not_implemented
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend` [high]: model assessed as stub | missing: Intentional placeholder; real device backends must implement the full Backend kernel contract.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.create_tensor` [high]: model assessed as stub | missing: Device tensor allocation and upload.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.gemm` [high]: model assessed as stub | missing: A GEMM kernel implementation.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.add` [high]: model assessed as stub | missing: An add kernel.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.relu` [high]: model assessed as stub | missing: A ReLU kernel.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.softmax` [high]: model assessed as stub | missing: A softmax kernel.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.attention` [high]: model assessed as stub | missing: An attention kernel.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.conv2d` [high]: model assessed as stub | missing: A conv2d kernel.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.mlp` [high]: model assessed as stub | missing: A fused MLP kernel.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.reduce` [high]: model assessed as stub | missing: A reduce kernel.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `ClusterBackend` [medium]: model assessed as stub | missing: RPC layer, graph partitioning, KV-cache sharding, and all-reduce at barriers.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `ASICBackend` [medium]: model assessed as stub | missing: An IR-to-microcode lowering and a hardware driver.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.create_tensor` [high]: model assessed as stub | missing: Intentionally abstract; implemented by concrete backends.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.gemm` [high]: model assessed as stub | missing: Intentionally abstract; concrete implementation in subclasses.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.add` [high]: model assessed as stub | missing: Intentionally abstract.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.relu` [high]: model assessed as stub | missing: Intentionally abstract.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.softmax` [high]: model assessed as stub | missing: Intentionally abstract.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.attention` [high]: model assessed as stub | missing: Intentionally abstract.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.conv2d` [high]: model assessed as stub | missing: Intentionally abstract.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.mlp` [medium]: model assessed as stub | missing: Intentionally abstract.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.reduce` [high]: model assessed as stub | missing: Intentionally abstract.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.create_tensor` [high]: model assessed as stub | missing: Nothing is expected in the base class; concrete backends supply the implementation.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.gemm` [high]: model assessed as stub | missing: Implemented by concrete backends.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.add` [high]: model assessed as stub | missing: Implemented by concrete backends.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.relu` [high]: model assessed as stub | missing: Implemented by concrete backends.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.softmax` [high]: model assessed as stub | missing: Implemented by concrete backends.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.attention` [high]: model assessed as stub | missing: Implemented by concrete backends.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.conv2d` [high]: model assessed as stub | missing: Implemented by concrete backends.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.mlp` [high]: model assessed as stub | missing: Implemented by concrete backends.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.reduce` [high]: model assessed as stub | missing: Implemented by concrete backends.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.create_tensor` [high]: model assessed as stub | missing: Intentionally abstract; concrete implementations live in subclasses.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.gemm` [high]: model assessed as stub | missing: Intentionally abstract; implementation in concrete backends.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.add` [high]: model assessed as stub | missing: Intentionally abstract.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.relu` [high]: model assessed as stub | missing: Intentionally abstract.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.softmax` [high]: model assessed as stub | missing: Intentionally abstract.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.attention` [high]: model assessed as stub | missing: Intentionally abstract.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.conv2d` [high]: model assessed as stub | missing: Intentionally abstract.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.mlp` [medium]: model assessed as stub | missing: Intentionally abstract.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.reduce` [high]: model assessed as stub | missing: Intentionally abstract.
- `client/src/hooks/useBatchActions.ts` `useBatchActions` [medium]: body is empty; model assessed as partial | missing: Several defects. (1) The job-progress branch returns from `execute` before polling finishes. It never fires toast, onSuccess or invalidateQueries on completion, and the polling interval is never cleared on unmount. (2) The AbortController is created but its signal is never passed to apiRequest, so `cancel` does not abort the request. (3) `execute` clears pendingConfig on success, so `retryFailed` (which requires pendingConfig) effectively returns null unless confirm is called again. (4) The parser requires success+failed to equal the requested count, which seems incompatible with an asynchronous job response that is still in progress. (5) The async setInterval callback can overlap requests. (6) Simulated progress is cosmetic.
- `client/src/hooks/useBatchActions.ts` `useReleaseBatchActions` [medium]: body is empty
- `client/src/hooks/useBatchActions.ts` `useTrackBatchActions` [medium]: body is empty
- `client/src/hooks/useBatchActions.ts` `usePostBatchActions` [medium]: body is empty
- `client/src/hooks/useBatchActions.ts` `useBeatBatchActions` [medium]: body is empty
- `client/src/hooks/useBatchActions.ts` `useAnalyticsBatchActions` [medium]: body is empty
- `client/src/hooks/useBatchActions.ts` `<module-level>` [low]: docs claim: Single batch-action API on the client | missing: Single batch-action API on the client
- `.task123-publishing-candidate/client/src/hooks/useBatchAction.ts` `useBatchAction` [medium]: body is empty; model assessed as partial | missing: Pass abortController.signal to the request and handle abort. Keep the last config so retryFailed works after execute. Add interval cleanup on unmount and a guard against overlapping executes.
- `.task123-publishing-candidate/client/src/hooks/useBatchAction.ts` `useDistributionBatchActions` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useBatchAction.ts` `useSocialBatchActions` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useBatchAction.ts` `useMarketplaceBatchActions` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useBatchAction.ts` `useFileBatchActions` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useBatchAction.ts` `useAnalyticsBatchActions` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useBatchActions.ts` `useBatchActions` [medium]: body is empty; model assessed as partial | missing: Several behaviours look incomplete or buggy. (1) The AbortController is created but never passed to apiRequest, so cancel() cannot abort the in-flight request. (2) pollJobProgress only starts a setInterval and returns immediately, so `await pollJobProgress` does not wait for the job. In job mode, toasts, onSuccess and invalidateQueries are never run, and result is not updated with the final job outcome. (3) execute clears pendingConfig on success, so retryFailed (which needs pendingConfig) returns null after a normal run. pendingConfig is only set by confirm(). (4) No unmount cleanup of the intervals. (5) onProgress is called inside a setState updater, which is a side effect. (6) The ETA division can produce Infinity when elapsed is 0. (7) onSuccess is not called in the all-failed case, and onError is not called either.
- `.task123-publishing-candidate/client/src/hooks/useBatchActions.ts` `useReleaseBatchActions` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useBatchActions.ts` `useTrackBatchActions` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useBatchActions.ts` `usePostBatchActions` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useBatchActions.ts` `useBeatBatchActions` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useBatchActions.ts` `useAnalyticsBatchActions` [medium]: body is empty
- `.task123-publishing-candidate/reports/aso/isolated-full-20261106T233139Z/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `DefaultSyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/aso/isolated-full-20261106T233139Z/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `EmptySyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/aso/isolated-full-20261106T233139Z/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `StructSyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/aso/isolated-full-20261106T233139Z/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `TupleSyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/aso/isolated-full-20261106T233139Z/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `MSVCTupleSyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/aso/isolated-full-20261106T233139Z/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `StdCellSyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/test-verification/final-map-refresh/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `DefaultSyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/test-verification/final-map-refresh/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `EmptySyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/test-verification/final-map-refresh/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `StructSyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/test-verification/final-map-refresh/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `TupleSyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/test-verification/final-map-refresh/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `MSVCTupleSyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/test-verification/final-map-refresh/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `StdCellSyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/test-verification/final-plan-fix/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `DefaultSyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/test-verification/final-plan-fix/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `EmptySyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/test-verification/final-plan-fix/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `StructSyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/test-verification/final-plan-fix/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `TupleSyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/test-verification/final-plan-fix/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `MSVCTupleSyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/test-verification/final-plan-fix/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `StdCellSyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/test-verification/full-current/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `DefaultSyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/test-verification/full-current/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `EmptySyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/test-verification/full-current/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `StructSyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/test-verification/full-current/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `TupleSyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/test-verification/full-current/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `MSVCTupleSyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/reports/test-verification/full-current/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `StdCellSyntheticProvider.update` [medium]: body is pass
- `client/src/hooks/useBatchAction.ts` `useBatchAction` [medium]: body is empty; model assessed as partial | missing: Pass abortControllerRef.signal to apiRequest and handle abort. Keep the last executed config so retryFailed works. Decide whether onError should fire on total failure. Report real progress if the server supports it.
- `client/src/hooks/useBatchAction.ts` `useDistributionBatchActions` [medium]: body is empty
- `client/src/hooks/useBatchAction.ts` `useSocialBatchActions` [medium]: body is empty
- `client/src/hooks/useBatchAction.ts` `useMarketplaceBatchActions` [medium]: body is empty
- `client/src/hooks/useBatchAction.ts` `useFileBatchActions` [medium]: body is empty
- `client/src/hooks/useBatchAction.ts` `useAnalyticsBatchActions` [medium]: body is empty
- `reports/aso/isolated-full-20261106T233139Z/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `DefaultSyntheticProvider.update` [medium]: body is pass
- `reports/aso/isolated-full-20261106T233139Z/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `EmptySyntheticProvider.update` [medium]: body is pass
- `reports/aso/isolated-full-20261106T233139Z/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `StructSyntheticProvider.update` [medium]: body is pass
- `reports/aso/isolated-full-20261106T233139Z/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `TupleSyntheticProvider.update` [medium]: body is pass
- `reports/aso/isolated-full-20261106T233139Z/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `MSVCTupleSyntheticProvider.update` [medium]: body is pass
- `reports/aso/isolated-full-20261106T233139Z/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `StdCellSyntheticProvider.update` [medium]: body is pass
- `reports/test-verification/final-map-refresh/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `DefaultSyntheticProvider.update` [medium]: body is pass
- `reports/test-verification/final-map-refresh/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `EmptySyntheticProvider.update` [medium]: body is pass
- `reports/test-verification/final-map-refresh/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `StructSyntheticProvider.update` [medium]: body is pass
- `reports/test-verification/final-map-refresh/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `TupleSyntheticProvider.update` [medium]: body is pass
- `reports/test-verification/final-map-refresh/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `MSVCTupleSyntheticProvider.update` [medium]: body is pass
- `reports/test-verification/final-map-refresh/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `StdCellSyntheticProvider.update` [medium]: body is pass
- `reports/test-verification/final-plan-fix/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `DefaultSyntheticProvider.update` [medium]: body is pass
- `reports/test-verification/final-plan-fix/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `EmptySyntheticProvider.update` [medium]: body is pass
- `reports/test-verification/final-plan-fix/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `StructSyntheticProvider.update` [medium]: body is pass
- `reports/test-verification/final-plan-fix/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `TupleSyntheticProvider.update` [medium]: body is pass
- `reports/test-verification/final-plan-fix/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `MSVCTupleSyntheticProvider.update` [medium]: body is pass
- `reports/test-verification/final-plan-fix/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `StdCellSyntheticProvider.update` [medium]: body is pass
- `reports/test-verification/full-current/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `DefaultSyntheticProvider.update` [medium]: body is pass
- `reports/test-verification/full-current/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `EmptySyntheticProvider.update` [medium]: body is pass
- `reports/test-verification/full-current/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `StructSyntheticProvider.update` [medium]: body is pass
- `reports/test-verification/full-current/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `TupleSyntheticProvider.update` [medium]: body is pass
- `reports/test-verification/full-current/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `MSVCTupleSyntheticProvider.update` [medium]: body is pass
- `reports/test-verification/full-current/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py` `StdCellSyntheticProvider.update` [medium]: body is pass
- `.task123-publishing-candidate/client/src/hooks/useBulkAction.ts` `useBulkAction` [medium]: body is empty; model assessed as partial | missing: The AbortController signal is never passed to apiRequest, so cancel() cannot actually abort the request. Progress is not incremental. confirmMessage is carried in the config but never used by the hook. The 'all items failed' path does not call onError.
- `.task123-publishing-candidate/client/src/hooks/useBulkAction.ts` `useBulkDelete` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useBulkAction.ts` `useBulkUpdate` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useBulkAction.ts` `useBulkExport` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useBulkAction.ts` `useBulkStatusChange` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useModuleShortcuts.ts` `useStudioShortcuts` [medium]: body is empty; model assessed as partial | missing: Default handlers in STUDIO_MODULE_SHORTCUTS are empty; it depends on callers to supply real handlers. No callers were found to wire them. The inventory's 'empty' flag refers to those placeholder handlers. Duplicate 's' key bindings (solo vs. save differ by modifier) are fine.
- `.task123-publishing-candidate/client/src/hooks/useModuleShortcuts.ts` `useAnalyticsShortcuts` [medium]: body is empty; model assessed as partial | missing: Real handlers must come from callers; defaults are empty and no caller exists.
- `.task123-publishing-candidate/client/src/hooks/useModuleShortcuts.ts` `useSocialShortcuts` [medium]: body is empty; model assessed as partial | missing: Real handlers must be supplied; defaults are empty and no caller was found.
- `.task123-publishing-candidate/client/src/hooks/useModuleShortcuts.ts` `useDistributionShortcuts` [medium]: body is empty; model assessed as partial | missing: Real handlers must be supplied by callers; defaults are empty and no caller exists.
- `.task123-publishing-candidate/client/src/hooks/useModuleShortcuts.ts` `useMarketplaceShortcuts` [medium]: body is empty; model assessed as partial | missing: Real handlers must be supplied; defaults are empty and no caller found.
- `client/src/hooks/useBulkAction.ts` `useBulkAction` [medium]: body is empty; model assessed as partial | missing: The abort signal is not wired into apiRequest, so cancel during processing only resets UI state. Progress is not granular. confirmMessage is carried in the config but never used by the hook. Invalidation does not run on thrown errors.
- `client/src/hooks/useBulkAction.ts` `useBulkDelete` [medium]: body is empty
- `client/src/hooks/useBulkAction.ts` `useBulkUpdate` [medium]: body is empty
- `client/src/hooks/useBulkAction.ts` `useBulkExport` [medium]: body is empty; model assessed as partial | missing: There is no handling of the exported file or download. The result schema only reports per-ID success.
- `client/src/hooks/useBulkAction.ts` `useBulkStatusChange` [medium]: body is empty
- `client/src/hooks/useModuleShortcuts.ts` `useStudioShortcuts` [medium]: body is empty; model assessed as partial | missing: No handlers are bound by default. Callers must pass handlers, and none exist in this repo. Also note 's' is bound to both 'solo' and 'schedule'-like conflicts in other modules, and 'cmd+s' vs 's' are distinct.
- `client/src/hooks/useModuleShortcuts.ts` `useAnalyticsShortcuts` [medium]: body is empty; model assessed as partial | missing: No default handlers are wired and no callers were found.
- `client/src/hooks/useModuleShortcuts.ts` `useSocialShortcuts` [medium]: body is empty; model assessed as partial | missing: No real handlers are bound and no callers were found.
- `client/src/hooks/useModuleShortcuts.ts` `useDistributionShortcuts` [medium]: body is empty; model assessed as partial | missing: No real handlers are bound and no callers were found.
- `client/src/hooks/useModuleShortcuts.ts` `useMarketplaceShortcuts` [medium]: body is empty; model assessed as partial | missing: No real handlers are bound and no callers were found.
- `.task123-publishing-candidate/scripts/simulate-production.mjs` `requestOnAgent` [medium]: body is empty
- `.task123-publishing-candidate/scripts/simulate-production.mjs` `buildEnv` [medium]: body is empty
- `.task123-publishing-candidate/scripts/simulate-production.mjs` `runProcess` [medium]: body is empty
- `.task123-publishing-candidate/scripts/simulate-production.mjs` `request` [medium]: body is empty
- `.task123-publishing-candidate/scripts/test-data-runtime.mjs` `newBullMQRedisConnection` [medium]: body is empty; model assessed as stub | missing: Nothing is needed. It is a deliberate empty mock.
- `.task123-publishing-candidate/scripts/test-data-runtime.mjs` `flushFeatureEvents` [medium]: body is empty; model assessed as stub | missing: Nothing is needed. It is a deliberate no-op mock.
- `.task123-publishing-candidate/scripts/test-data-runtime.mjs` `encode` [medium]: body is empty; model assessed as stub | missing: Nothing is needed. It is a deliberate no-op mock.
- `.task123-publishing-candidate/scripts/test-data-runtime.mjs` `decode` [medium]: body is empty; model assessed as stub | missing: Nothing is needed. It is a deliberate no-op mock.
- `.task123-publishing-candidate/server/services/backup/postgresTools.ts` `probePostgresTools` [medium]: body is empty
- `.task123-publishing-candidate/server/services/backup/postgresTools.ts` `selectPgDumpForServer` [medium]: body is empty
- `.task123-publishing-candidate/server/services/backup/postgresTools.ts` `selectPsqlForRestore` [medium]: body is empty
- `.task123-publishing-candidate/server/services/backup/postgresTools.ts` `parsePostgresClientVersion` [medium]: model assessed as partial | missing: Cannot parse versions without '(PostgreSQL)' marker or dev/beta forms like '17beta1' (parsed as major only, fine) or EnterpriseDB variants; probably acceptable.
- `client/src/lib/video/TemplateCompiler.ts` `compileTemplate` [medium]: body is empty; model assessed as partial | missing: CompilerOptions fields optimizeForExport, generateThumbnail and audioAnalysis are never read
- `client/src/lib/video/TemplateCompiler.ts` `createVideoProjectFromTemplate` [medium]: body is empty
- `client/src/lib/video/TemplateCompiler.ts` `scaleProjectToAspectRatio` [medium]: model assessed as partial | missing: Config mutation leaks into the input project; no validation of the aspect ratio key
- `client/src/lib/video/TemplateCompiler.ts` `scaleLayerConfig` [medium]: model assessed as partial | missing: Should clone rather than mutate; emissionArea, particle size and the like are not scaled
- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py` `CUDARuntime.syncthreads` [medium]: body is pass; model assessed as stub | missing: Intentionally a no-op by design. It would need real barrier semantics only if threads were ever simulated individually.
- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py` `WarpState` [medium]: model assessed as partial | missing: The lane buffer _vals is loaded but never read by the reduction methods, which operate on caller-supplied arrays.
- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py` `WarpState.shfl_down_sync` [high]: model assessed as partial | missing: It is not a true shuffle, since it returns the sum rather than the shifted value. The mask is ignored, and there is no length validation.
- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py` `<module-level>` [low]: docs claim: Digital GPU runs CUDA-written .cu kernels as the contract | missing: Digital GPU runs CUDA-written .cu kernels as the contract
- `scripts/simulate-production.mjs` `requestOnAgent` [medium]: body is empty
- `scripts/simulate-production.mjs` `buildEnv` [medium]: body is empty
- `scripts/simulate-production.mjs` `runProcess` [medium]: body is empty
- `scripts/simulate-production.mjs` `request` [medium]: body is empty
- `scripts/test-data-runtime.mjs` `newBullMQRedisConnection` [medium]: body is empty
- `scripts/test-data-runtime.mjs` `flushFeatureEvents` [medium]: body is empty
- `scripts/test-data-runtime.mjs` `encode` [medium]: body is empty; model assessed as stub | missing: Intentionally empty; no real encoding.
- `scripts/test-data-runtime.mjs` `decode` [medium]: body is empty; model assessed as stub | missing: Intentionally empty.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py` `CUDARuntime.syncthreads` [medium]: body is pass
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py` `WarpState` [medium]: model assessed as partial | missing: The internal lane state (_vals, load) is not integrated with the reduction methods, and no accessor to it exists.
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py` `WarpState.shfl_down_sync` [high]: model assessed as partial | missing: Mask handling. True shuffle semantics, with the addition done by the caller. Length validation.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py` `CUDARuntime.syncthreads` [medium]: body is pass; model assessed as stub | missing: Nothing is needed under the current execution model. It would need real barrier logic if threads were ever executed concurrently.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py` `WarpState` [medium]: model assessed as partial | missing: Only shfl_down is modelled. The mask is ignored and no other shuffle variants exist. Its own _vals buffer is never used by the reduction methods.
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py` `WarpState.shfl_down_sync` [medium]: model assessed as partial | missing: Fidelity to the CUDA semantics: it returns val+shifted rather than the shuffled value, honours no mask, and does not validate the length.
- `.task123-publishing-candidate/client/src/lib/a11y/focus.ts` `createFocusIndicatorStyles` [medium]: body is empty
- `.task123-publishing-candidate/client/src/lib/a11y/focus.ts` `applyFocusIndicator` [medium]: body is empty
- `.task123-publishing-candidate/client/src/lib/a11y/focus.ts` `isElementFocusable` [medium]: model assessed as partial | missing: Handle contenteditable, input[type=hidden], inert and hidden ancestors, and the shared logic with getFocusableElements, if complete detection is intended.
- `.task123-publishing-candidate/client/src/lib/video/TemplateCompiler.ts` `compileTemplate` [medium]: body is empty
- `.task123-publishing-candidate/client/src/lib/video/TemplateCompiler.ts` `createVideoProjectFromTemplate` [medium]: body is empty
- `.task123-publishing-candidate/client/src/lib/video/TemplateCompiler.ts` `scaleLayerConfig` [medium]: model assessed as partial | missing: Non-mutating copy; scaling of the remaining spatial fields (emissionArea, strokeWidth, barGap, cornerRadius, particle sizes).
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py` `CUDARuntime.syncthreads` [medium]: body is pass
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py` `WarpState` [medium]: model assessed as partial | missing: The internal _vals state is loaded but never read by any method.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py` `WarpState.shfl_down_sync` [medium]: model assessed as partial | missing: The mask is ignored. There is no pure shuffle semantics for callers that need the shifted value alone, and no length validation.
- `client/src/lib/a11y/focus.ts` `createFocusIndicatorStyles` [medium]: body is empty
- `client/src/lib/a11y/focus.ts` `applyFocusIndicator` [medium]: body is empty
- `client/src/lib/a11y/focus.ts` `isElementFocusable` [medium]: model assessed as partial | missing: It does not handle contenteditable, input type=hidden, hidden ancestors, the inert attribute, or the audio/video controls case. It treats tabindex=-1 as not focusable even though such elements are programmatically focusable.
- `server/services/backup/postgresTools.ts` `probePostgresTools` [medium]: body is empty
- `server/services/backup/postgresTools.ts` `selectPgDumpForServer` [medium]: body is empty
- `server/services/backup/postgresTools.ts` `selectPsqlForRestore` [medium]: body is empty
- `.pdim-cluster-test-Pidv4k/cluster-fixture.mjs` `computeWorkerSizing` [medium]: body is empty
- `.pdim-cluster-test-Pidv4k/cluster-fixture.mjs` `unsubscribe` [medium]: body is empty
- `.task123-publishing-candidate/.pdim-cluster-test-Pidv4k/cluster-fixture.mjs` `computeWorkerSizing` [medium]: body is empty
- `.task123-publishing-candidate/.pdim-cluster-test-Pidv4k/cluster-fixture.mjs` `unsubscribe` [medium]: body is empty
- `.task123-publishing-candidate/AI enhancements/advancedVideoRendererService.ts` `compositeTextOnLocalVideo` [medium]: body is empty
- `.task123-publishing-candidate/AI enhancements/advancedVideoRendererService.ts` `compositeTextOnMaxcoreVideo` [medium]: body is empty
- `.task123-publishing-candidate/client/src/lib/a11y/keyboard.ts` `createFocusTrap` [medium]: body is empty; model assessed as partial | missing: Escape does not deactivate the trap itself, despite the option name escapeDeactivates. It only calls onEscape, so the caller must deactivate. Nothing in the module is called anywhere in the repo.
- `.task123-publishing-candidate/client/src/lib/a11y/keyboard.ts` `createRovingTabIndex` [medium]: body is empty; model assessed as partial | missing: Items added or removed after setup are not re-indexed until a key is pressed. Focusing an item by click or Tab does not update currentIndex or tabindex. In grid mode, up/down moves by columns, and with loop it wraps to index 0 or the last item rather than the same column. No callers.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/director/analytics.py` `AnalyticsSource.get_recent` [medium]: body is ellipsis; model assessed as stub | missing: Nothing; it is an intentional protocol stub whose body is an ellipsis.
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/director/analytics.py` `AnalyticsSource.record` [medium]: body is ellipsis; model assessed as stub | missing: Nothing; it is an intentional protocol stub.
- `.task123-publishing-candidate/script/deployment/executive.mjs` `notify` [medium]: body is empty
- `.task123-publishing-candidate/script/deployment/executive.mjs` `unbind` [medium]: body is empty
- `.task123-publishing-candidate/script/lib/provisionPortablePython.mjs` `command` [medium]: body is empty
- `.task123-publishing-candidate/script/lib/provisionPortablePython.mjs` `provisionPortablePython` [medium]: body is empty
- `.task123-publishing-candidate/scripts/database-recovery-drill.mjs` `run` [medium]: body is empty
- `.task123-publishing-candidate/scripts/database-recovery-drill.mjs` `escapeRegExp` [medium]: body is empty
- `.task123-publishing-candidate/scripts/readiness-assembled-acceptance.mjs` `request` [medium]: body is empty
- `.task123-publishing-candidate/scripts/readiness-assembled-acceptance.mjs` `authRequest` [medium]: body is empty
- `.task123-publishing-candidate/scripts/testing/page80-acceptance.mjs` `request` [medium]: body is empty
- `.task123-publishing-candidate/scripts/testing/page80-acceptance.mjs` `authRequest` [medium]: body is empty
- `.task123-publishing-candidate/server/lib/stripeClient.ts` `lazyStripeClient` [medium]: body is empty
- `.task123-publishing-candidate/server/lib/stripeClient.ts` `createStripeClient` [medium]: body is empty
- `.task123-publishing-candidate/server/services/safeUrlFetch.ts` `safeFetchText` [medium]: body is empty
- `.task123-publishing-candidate/server/services/safeUrlFetch.ts` `safeFetchBuffer` [medium]: body is empty
- `AI enhancements/advancedVideoRendererService.ts` `compositeTextOnLocalVideo` [medium]: body is empty
- `AI enhancements/advancedVideoRendererService.ts` `compositeTextOnMaxcoreVideo` [medium]: body is empty
- `client/src/lib/a11y/keyboard.ts` `createFocusTrap` [medium]: body is empty
- `client/src/lib/a11y/keyboard.ts` `createRovingTabIndex` [medium]: body is empty; model assessed as partial | missing: Tabindex is not updated when an item receives focus by click or programmatically. Newly added items do not get tabindex until a key is pressed. Grid movement with looping wraps by index rather than by column.
- `external/maxcore/artifacts/ai-training-server/ai_model/director/analytics.py` `AnalyticsSource.get_recent` [medium]: body is ellipsis
- `external/maxcore/artifacts/ai-training-server/ai_model/director/analytics.py` `AnalyticsSource.record` [medium]: body is ellipsis
- `script/deployment/executive.mjs` `notify` [medium]: body is empty
- `script/deployment/executive.mjs` `unbind` [medium]: body is empty
- `script/lib/provisionPortablePython.mjs` `command` [medium]: body is empty
- `script/lib/provisionPortablePython.mjs` `provisionPortablePython` [medium]: body is empty
- `scripts/database-recovery-drill.mjs` `run` [medium]: body is empty
- `scripts/database-recovery-drill.mjs` `escapeRegExp` [medium]: body is empty
- `scripts/readiness-assembled-acceptance.mjs` `request` [medium]: body is empty
- `scripts/readiness-assembled-acceptance.mjs` `authRequest` [medium]: body is empty
- `scripts/testing/page80-acceptance.mjs` `request` [medium]: body is empty
- `scripts/testing/page80-acceptance.mjs` `authRequest` [medium]: body is empty
- `server/lib/stripeClient.ts` `lazyStripeClient` [medium]: body is empty
- `server/lib/stripeClient.ts` `createStripeClient` [medium]: body is empty
- `server/services/safeUrlFetch.ts` `safeFetchText` [medium]: body is empty
- `server/services/safeUrlFetch.ts` `safeFetchBuffer` [medium]: body is empty
- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-dashboard/src/pages/training.tsx` `apiFetch` [medium]: body is empty
- `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-dashboard/src/pages/training.tsx` `apiFetch` [medium]: body is empty
- `.task123-publishing-candidate/client/src/components/a11y/FocusTrap.tsx` `useFocusTrapHook` [medium]: body is empty
- `.task123-publishing-candidate/client/src/components/a11y/LiveRegion.tsx` `useLiveRegion` [medium]: body is empty
- `.task123-publishing-candidate/client/src/components/a11y/ReducedMotionWrapper.tsx` `useMotionSafeStyles` [medium]: body is empty
- `.task123-publishing-candidate/client/src/components/admin/MaxCoreCognitiveConsole.tsx` `apiResult` [medium]: body is empty
- `.task123-publishing-candidate/client/src/components/settings/SettingsOutcomeHandler.tsx` `useLoadingState` [medium]: body is empty
- `.task123-publishing-candidate/client/src/components/studio/FlowStateCollaborationPresence.tsx` `useCollaborationPresence` [medium]: body is empty
- `.task123-publishing-candidate/client/src/components/studio/StudioOneWrapper.tsx` `browserElement` [medium]: body is empty
- `.task123-publishing-candidate/client/src/components/undo/UndoKeyboardHandler.tsx` `useUndoKeyboardShortcuts` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/use-upload.ts` `useUpload` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useAIWorkflow.ts` `useAIWorkflow` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useActionHistory.ts` `useActionHistory` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useAnnounce.ts` `useAnnounce` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useAnnouncer.ts` `useAnnouncer` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useApiError.ts` `useApiError` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useAudioPlayer.ts` `useAudioPlayer` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useBatchProgress.ts` `useBatchProgress` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useContextMenu.ts` `useContextMenu` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useFluidLayout.ts` `useFluidLayout` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useFocusReturn.ts` `useFocusReturn` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useFullscreenFileUpload.ts` `useFullscreenFileUpload` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useGlobalUndo.ts` `useGlobalUndo` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useHighContrast.ts` `useHighContrast` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useNetworkStatus.ts` `useNetworkStatus` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useRecoveryPoints.ts` `useRecoveryPoints` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useReducedMotion.ts` `useReducedMotion` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useRovingFocus.ts` `useRovingFocus` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useRovingTabIndex.ts` `useRovingTabIndex` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useScreenReaderAnnounce.ts` `useScreenReaderAnnounce` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useScreenReaderAnnouncer.ts` `useScreenReaderAnnouncer` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useStudioOneWaveform.ts` `useStudioOneWaveform` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useSyncQueue.ts` `useSyncQueue` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useTemplate.ts` `useTemplate` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useUndoStack.ts` `useUndoStack` [medium]: body is empty
- `.task123-publishing-candidate/client/src/hooks/useWebSocket.ts` `useWebSocket` [medium]: body is empty
- `.task123-publishing-candidate/client/src/lib/video/RenderOrchestrator.ts` `createOrchestrator` [medium]: body is empty
- `.task123-publishing-candidate/client/src/lib/video/maxcoreVideoRenderer.ts` `renderMaxcoreVideo` [medium]: body is empty
- `.task123-publishing-candidate/docs/archive/production-variants-2026-08/history/scripts-and-config/scripts/deployment-autofix.mjs/deployment-autofix--54df3b7864e9.mjs` `run` [medium]: body is empty
- `.task123-publishing-candidate/docs/archive/production-variants-2026-08/history/scripts-and-config/scripts/deployment-autofix.mjs/deployment-autofix--7efb934770bc.mjs` `run` [medium]: body is empty
- `.task123-publishing-candidate/external/maxcore/artifacts/ai-dashboard/src/pages/training.tsx` `apiFetch` [medium]: body is empty
- `.task123-publishing-candidate/external/pdim/.replit_integration_files/client/src/hooks/use-upload.ts` `useUpload` [medium]: body is empty
- `.task123-publishing-candidate/external/pdim/scripts/src/generate-patent.ts` `body` [medium]: body is empty
- `.task123-publishing-candidate/reports/fix-all/.snapshots/ts-server-1785703493686/server/routes/maxcore.ts` `pdimRpc` [medium]: body is empty
- `.task123-publishing-candidate/reports/fix-all/.snapshots/ts-server-1785703493686/server/services/advancedUrlParser.ts` `parseUrl` [medium]: body is empty
- `.task123-publishing-candidate/reports/fix-all/.snapshots/ts-server-1785703493686/server/services/multimodalGenerationService.ts` `enrichTextAssetMetadata` [medium]: body is empty
- `.task123-publishing-candidate/reports/fix-all/.snapshots/ts-server-1785703493686/server/services/socialSyncService.ts` `refreshOAuth2Token` [medium]: body is empty
- `.task123-publishing-candidate/reports/fix-all/.snapshots/ts-server-1785703851828/server/routes/maxcore.ts` `pdimRpc` [medium]: body is empty
- `.task123-publishing-candidate/reports/fix-all/.snapshots/ts-server-1785703851828/server/services/advancedUrlParser.ts` `parseUrl` [medium]: body is empty
- `.task123-publishing-candidate/reports/fix-all/.snapshots/ts-server-1785703851828/server/services/multimodalGenerationService.ts` `enrichTextAssetMetadata` [medium]: body is empty
- `.task123-publishing-candidate/reports/fix-all/.snapshots/ts-server-1785703851828/server/services/socialSyncService.ts` `refreshOAuth2Token` [medium]: body is empty
- `.task123-publishing-candidate/reports/fix-all/.snapshots/ts-server-1786084146412/server/services/advancedUrlParser.ts` `parseUrl` [medium]: body is empty
- `.task123-publishing-candidate/reports/fix-all/.snapshots/ts-server-1786084146412/server/services/multimodalGenerationService.ts` `enrichTextAssetMetadata` [medium]: body is empty
- `.task123-publishing-candidate/reports/fix-all/.snapshots/ts-server-1786084146412/server/services/socialSyncService.ts` `refreshOAuth2Token` [medium]: body is empty
- `.task123-publishing-candidate/reports/fix-all/.snapshots/ts-server-1786102456133/server/services/advancedUrlParser.ts` `parseUrl` [medium]: body is empty
- `.task123-publishing-candidate/reports/fix-all/.snapshots/ts-server-1786102456133/server/services/multimodalGenerationService.ts` `enrichTextAssetMetadata` [medium]: body is empty
- `.task123-publishing-candidate/reports/fix-all/.snapshots/ts-server-1786102456133/server/services/socialSyncService.ts` `refreshOAuth2Token` [medium]: body is empty
- `.task123-publishing-candidate/script/lib/portablePython.mjs` `runPortablePython` [medium]: body is empty
- `.task123-publishing-candidate/scripts/archive-august-production-variants.mjs` `runGit` [medium]: body is empty
- `.task123-publishing-candidate/scripts/deployment-autofix.mjs` `run` [medium]: body is empty
- `.task123-publishing-candidate/scripts/fix-ts-errors-v2.mjs` `escRe` [medium]: body is empty
- `.task123-publishing-candidate/scripts/lib/productionSimulationPolicy.mjs` `assessHeavyRun` [medium]: body is empty
- `.task123-publishing-candidate/scripts/maxcore-eval-browser.mjs` `send` [medium]: body is empty
- `.task123-publishing-candidate/scripts/readiness-beta-simulation.mjs` `add` [medium]: body is empty
- `.task123-publishing-candidate/scripts/readiness-gauge/lib/checks.ts` `collectSecretHits` [medium]: body is empty
- `.task123-publishing-candidate/scripts/readiness-isolated-rehearsal.mjs` `run` [medium]: body is empty
- `.task123-publishing-candidate/scripts/readiness-packed-acceptance.mjs` `request` [medium]: body is empty
- `.task123-publishing-candidate/scripts/readiness-sast-scan.mjs` `runScan` [medium]: body is empty
- `.task123-publishing-candidate/scripts/testing/generation-reliability-gate.mjs` `request` [medium]: body is empty
- `.task123-publishing-candidate/scripts/testing/python-runtime-env.mjs` `createPythonChildEnvironment` [medium]: body is empty
- `.task123-publishing-candidate/scripts/verify-native-analysis.ts` `request` [medium]: body is empty
- `.task123-publishing-candidate/server/computeSizing.ts` `computeWorkerSizing` [medium]: body is empty
- `.task123-publishing-candidate/server/lib/cronScheduler.ts` `schedule` [medium]: body is empty
- `.task123-publishing-candidate/server/lib/localPdimServer.ts` `unsubscribe` [medium]: body is empty
- `.task123-publishing-candidate/server/middleware/apiCache.ts` `cacheMiddleware` [medium]: body is empty
- `.task123-publishing-candidate/server/middleware/idempotency.ts` `idempotencyMiddleware` [medium]: body is empty
- `.task123-publishing-candidate/server/routes/maxcore.ts` `pdimRpc` [medium]: body is empty
- `.task123-publishing-candidate/server/services/advancedUrlParser.ts` `parseUrl` [medium]: body is empty
- `.task123-publishing-candidate/server/services/audioGeneratorService.ts` `generateAudio` [medium]: body is empty
- `.task123-publishing-candidate/server/services/audioSourceResolver.ts` `NOOP_CLEANUP` [medium]: body is empty
- `.task123-publishing-candidate/server/services/backup/databaseDump.ts` `generateUncommittedDatabaseDump` [medium]: body is empty
- `.task123-publishing-candidate/server/services/backup/databaseRestore.ts` `runDatabaseRestore` [medium]: body is empty
- `.task123-publishing-candidate/server/services/beatAudioContext.ts` `beatAudioObservation` [medium]: body is empty
- `.task123-publishing-candidate/server/services/creativeModelService.ts` `submitFeedback` [medium]: body is empty
- `.task123-publishing-candidate/server/services/diffusionVideoService.ts` `generateDiffusionFrames` [medium]: body is empty
- `.task123-publishing-candidate/server/services/multimodalGenerationService.ts` `enrichTextAssetMetadata` [medium]: body is empty
- `.task123-publishing-candidate/server/services/projectDuplicationService.ts` `duplicateProject` [medium]: body is empty
- `.task123-publishing-candidate/server/services/pushNotificationTypes.ts` `buildPushPayload` [medium]: body is empty
- `.task123-publishing-candidate/server/services/socialSyncService.ts` `refreshOAuth2Token` [medium]: body is empty
- `.task123-publishing-candidate/server/services/voiceSynthesisService.ts` `synthesizeVoice` [medium]: body is empty
- `client/src/components/a11y/FocusTrap.tsx` `useFocusTrapHook` [medium]: body is empty
- `client/src/components/a11y/LiveRegion.tsx` `useLiveRegion` [medium]: body is empty
- `client/src/components/a11y/ReducedMotionWrapper.tsx` `useMotionSafeStyles` [medium]: body is empty
- `client/src/components/admin/MaxCoreCognitiveConsole.tsx` `apiResult` [medium]: body is empty
- `client/src/components/settings/SettingsOutcomeHandler.tsx` `useLoadingState` [medium]: body is empty
- `client/src/components/studio/FlowStateCollaborationPresence.tsx` `useCollaborationPresence` [medium]: body is empty
- `client/src/components/studio/StudioOneWrapper.tsx` `browserElement` [medium]: body is empty
- `client/src/components/undo/UndoKeyboardHandler.tsx` `useUndoKeyboardShortcuts` [medium]: body is empty
- `client/src/hooks/use-upload.ts` `useUpload` [medium]: body is empty
- `client/src/hooks/useAIWorkflow.ts` `useAIWorkflow` [medium]: body is empty
- `client/src/hooks/useActionHistory.ts` `useActionHistory` [medium]: body is empty
- `client/src/hooks/useAnnounce.ts` `useAnnounce` [medium]: body is empty
- `client/src/hooks/useAnnouncer.ts` `useAnnouncer` [medium]: body is empty
- `client/src/hooks/useApiError.ts` `useApiError` [medium]: body is empty
- `client/src/hooks/useAudioPlayer.ts` `useAudioPlayer` [medium]: body is empty
- `client/src/hooks/useBatchProgress.ts` `useBatchProgress` [medium]: body is empty
- `client/src/hooks/useContextMenu.ts` `useContextMenu` [medium]: body is empty
- `client/src/hooks/useFluidLayout.ts` `useFluidLayout` [medium]: body is empty
- `client/src/hooks/useFocusReturn.ts` `useFocusReturn` [medium]: body is empty
- `client/src/hooks/useFullscreenFileUpload.ts` `useFullscreenFileUpload` [medium]: body is empty
- `client/src/hooks/useGlobalUndo.ts` `useGlobalUndo` [medium]: body is empty
- `client/src/hooks/useHighContrast.ts` `useHighContrast` [medium]: body is empty
- `client/src/hooks/useNetworkStatus.ts` `useNetworkStatus` [medium]: body is empty
- `client/src/hooks/useRecoveryPoints.ts` `useRecoveryPoints` [medium]: body is empty
- `client/src/hooks/useReducedMotion.ts` `useReducedMotion` [medium]: body is empty
- `client/src/hooks/useRovingFocus.ts` `useRovingFocus` [medium]: body is empty
- `client/src/hooks/useRovingTabIndex.ts` `useRovingTabIndex` [medium]: body is empty
- `client/src/hooks/useScreenReaderAnnounce.ts` `useScreenReaderAnnounce` [medium]: body is empty
- `client/src/hooks/useScreenReaderAnnouncer.ts` `useScreenReaderAnnouncer` [medium]: body is empty
- `client/src/hooks/useStudioOneWaveform.ts` `useStudioOneWaveform` [medium]: body is empty
- `client/src/hooks/useSyncQueue.ts` `useSyncQueue` [medium]: body is empty
- `client/src/hooks/useTemplate.ts` `useTemplate` [medium]: body is empty
- `client/src/hooks/useUndoStack.ts` `useUndoStack` [medium]: body is empty
- `client/src/hooks/useWebSocket.ts` `useWebSocket` [medium]: body is empty
- `client/src/lib/video/RenderOrchestrator.ts` `createOrchestrator` [medium]: body is empty
- `client/src/lib/video/maxcoreVideoRenderer.ts` `renderMaxcoreVideo` [medium]: body is empty
- `docs/archive/production-variants-2026-08/history/scripts-and-config/scripts/deployment-autofix.mjs/deployment-autofix--54df3b7864e9.mjs` `run` [medium]: body is empty
- `docs/archive/production-variants-2026-08/history/scripts-and-config/scripts/deployment-autofix.mjs/deployment-autofix--7efb934770bc.mjs` `run` [medium]: body is empty
- `external/maxcore/artifacts/ai-dashboard/src/pages/training.tsx` `apiFetch` [medium]: body is empty
- `external/pdim/.replit_integration_files/client/src/hooks/use-upload.ts` `useUpload` [medium]: body is empty
- `external/pdim/scripts/src/generate-patent.ts` `body` [medium]: body is empty
- `reports/fix-all/.snapshots/ts-server-1785703493686/server/routes/maxcore.ts` `pdimRpc` [medium]: body is empty
- `reports/fix-all/.snapshots/ts-server-1785703493686/server/services/advancedUrlParser.ts` `parseUrl` [medium]: body is empty
- `reports/fix-all/.snapshots/ts-server-1785703493686/server/services/multimodalGenerationService.ts` `enrichTextAssetMetadata` [medium]: body is empty
- `reports/fix-all/.snapshots/ts-server-1785703493686/server/services/socialSyncService.ts` `refreshOAuth2Token` [medium]: body is empty
- `reports/fix-all/.snapshots/ts-server-1785703851828/server/routes/maxcore.ts` `pdimRpc` [medium]: body is empty
- `reports/fix-all/.snapshots/ts-server-1785703851828/server/services/advancedUrlParser.ts` `parseUrl` [medium]: body is empty
- `reports/fix-all/.snapshots/ts-server-1785703851828/server/services/multimodalGenerationService.ts` `enrichTextAssetMetadata` [medium]: body is empty
- `reports/fix-all/.snapshots/ts-server-1785703851828/server/services/socialSyncService.ts` `refreshOAuth2Token` [medium]: body is empty
- `reports/fix-all/.snapshots/ts-server-1786084146412/server/services/advancedUrlParser.ts` `parseUrl` [medium]: body is empty
- `reports/fix-all/.snapshots/ts-server-1786084146412/server/services/multimodalGenerationService.ts` `enrichTextAssetMetadata` [medium]: body is empty
- `reports/fix-all/.snapshots/ts-server-1786084146412/server/services/socialSyncService.ts` `refreshOAuth2Token` [medium]: body is empty
- `reports/fix-all/.snapshots/ts-server-1786102456133/server/services/advancedUrlParser.ts` `parseUrl` [medium]: body is empty
- `reports/fix-all/.snapshots/ts-server-1786102456133/server/services/multimodalGenerationService.ts` `enrichTextAssetMetadata` [medium]: body is empty
- `reports/fix-all/.snapshots/ts-server-1786102456133/server/services/socialSyncService.ts` `refreshOAuth2Token` [medium]: body is empty
- `script/lib/portablePython.mjs` `runPortablePython` [medium]: body is empty
- `scripts/archive-august-production-variants.mjs` `runGit` [medium]: body is empty
- `scripts/deployment-autofix.mjs` `run` [medium]: body is empty
- `scripts/fix-ts-errors-v2.mjs` `escRe` [medium]: body is empty
- `scripts/lib/productionSimulationPolicy.mjs` `assessHeavyRun` [medium]: body is empty
- `scripts/maxcore-eval-browser.mjs` `send` [medium]: body is empty
- `scripts/readiness-beta-simulation.mjs` `add` [medium]: body is empty
- `scripts/readiness-gauge/lib/checks.ts` `collectSecretHits` [medium]: body is empty
- `scripts/readiness-isolated-rehearsal.mjs` `run` [medium]: body is empty
- `scripts/readiness-packed-acceptance.mjs` `request` [medium]: body is empty
- `scripts/readiness-sast-scan.mjs` `runScan` [medium]: body is empty
- `scripts/testing/generation-reliability-gate.mjs` `request` [medium]: body is empty
- `scripts/testing/python-runtime-env.mjs` `createPythonChildEnvironment` [medium]: body is empty
- `scripts/verify-native-analysis.ts` `request` [medium]: body is empty
- `server/computeSizing.ts` `computeWorkerSizing` [medium]: body is empty
- `server/lib/cronScheduler.ts` `schedule` [medium]: body is empty
- `server/lib/localPdimServer.ts` `unsubscribe` [medium]: body is empty
- `server/middleware/apiCache.ts` `cacheMiddleware` [medium]: body is empty
- `server/middleware/idempotency.ts` `idempotencyMiddleware` [medium]: body is empty
- `server/routes/maxcore.ts` `pdimRpc` [medium]: body is empty
- `server/services/advancedUrlParser.ts` `parseUrl` [medium]: body is empty
- `server/services/audioGeneratorService.ts` `generateAudio` [medium]: body is empty
- `server/services/audioSourceResolver.ts` `NOOP_CLEANUP` [medium]: body is empty
- `server/services/backup/databaseDump.ts` `generateUncommittedDatabaseDump` [medium]: body is empty
- `server/services/backup/databaseRestore.ts` `runDatabaseRestore` [medium]: body is empty
- `server/services/beatAudioContext.ts` `beatAudioObservation` [medium]: body is empty
- `server/services/creativeModelService.ts` `submitFeedback` [medium]: body is empty
- `server/services/diffusionVideoService.ts` `generateDiffusionFrames` [medium]: body is empty
- `server/services/multimodalGenerationService.ts` `enrichTextAssetMetadata` [medium]: body is empty
- `server/services/projectDuplicationService.ts` `duplicateProject` [medium]: body is empty
- `server/services/pushNotificationTypes.ts` `buildPushPayload` [medium]: body is empty
- `server/services/socialSyncService.ts` `refreshOAuth2Token` [medium]: body is empty
- `server/services/voiceSynthesisService.ts` `synthesizeVoice` [medium]: body is empty

## Claims in the docs with no matching implementation

- Cluster and ASIC backends in the MaxCore backend registry (evidence: future_backends.py declares them as unavailable and every kernel raises NotImplementedError. The README says only that CUDA kernels run via the Python digital GPU.; suggested file: external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py)
- Digital GPU runs CUDA-written .cu kernels as the contract (evidence: runtime.py only emulates the execution model, so SM102 kernels are hand-written Python functions. No .cu parser or translator appears in the summaries, so the claim that .cu files are the contract is only partly backed.; suggested file: external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py)
- The README is truncated mid-sentence ('It learns fro...'), so MaxCore's serving and learning behavior, MAXCORE_SERVING_RELEASE=live-awareness, and the Neon TLS WebSocket bridge cannot be checked from the provided files. (evidence: No supervisor or bridge module is among the documented modules.; suggested file: unknown)
- Single batch-action API on the client (evidence: Three overlapping hook modules (useBatchAction, useBatchActions, useBulkAction) target the same /api/batch endpoints, and the README does not say which is canonical.; suggested file: client/src/hooks/useBatchActions.ts)
- Duplicate trees (.task123-publishing-candidate and .pdim-scratch copies) are present in the repo (evidence: Identical modules appear under several roots, which looks like scratch or candidate copies and is undocumented in the README.; suggested file: unknown)

## Third-party dependencies

- `fitz`: 1 file(s), surface ['Matrix', 'open']: eligible
- `${_msgpackrUrl}`: 42 file(s), surface unknown: used in 42 files (> 10)
- `${_wasmoonUrl}`: 42 file(s), surface unknown: used in 42 files (> 10)
- `@google-cloud/storage`: 12 file(s), surface unknown: used in 12 files (> 10)
- `msgpackr`: 12 file(s), surface unknown: used in 12 files (> 10)
- `pino`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `wasmoon`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@/components`: 1371 file(s), surface unknown: used in 1371 files (> 10)
- `@/pages`: 8 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@tanstack/react-query`: 554 file(s), surface unknown: used in 554 files (> 10)
- `react`: 2042 file(s), surface unknown: used in 2042 files (> 10)
- `wouter`: 208 file(s), surface unknown: used in 208 files (> 10)
- `lucide-react`: 1433 file(s), surface unknown: used in 1433 files (> 10)
- `@/hooks`: 725 file(s), surface unknown: used in 725 files (> 10)
- `framer-motion`: 293 file(s), surface unknown: used in 293 files (> 10)
- `@/lib`: 1800 file(s), surface unknown: used in 1800 files (> 10)
- `@radix-ui/react-accordion`: 14 file(s), surface unknown: used in 14 files (> 10)
- `@radix-ui/react-alert-dialog`: 14 file(s), surface unknown: used in 14 files (> 10)
- `class-variance-authority`: 198 file(s), surface unknown: security-sensitive (crypto/auth/TLS): never rebuilt in-house automatically
- `@radix-ui/react-aspect-ratio`: 14 file(s), surface unknown: used in 14 files (> 10)
- `@radix-ui/react-avatar`: 14 file(s), surface unknown: used in 14 files (> 10)
- `@radix-ui/react-slot`: 80 file(s), surface unknown: used in 80 files (> 10)
- `react-day-picker`: 14 file(s), surface unknown: used in 14 files (> 10)
- `embla-carousel-react`: 14 file(s), surface unknown: used in 14 files (> 10)
- `recharts`: 42 file(s), surface unknown: used in 42 files (> 10)
- `@radix-ui/react-checkbox`: 14 file(s), surface unknown: used in 14 files (> 10)
- `@radix-ui/react-collapsible`: 14 file(s), surface unknown: used in 14 files (> 10)
- `@radix-ui/react-dialog`: 42 file(s), surface unknown: used in 42 files (> 10)
- `cmdk`: 14 file(s), surface unknown: used in 14 files (> 10)
- `@radix-ui/react-context-menu`: 14 file(s), surface unknown: used in 14 files (> 10)
- `vaul`: 12 file(s), surface unknown: used in 12 files (> 10)
- `@radix-ui/react-dropdown-menu`: 14 file(s), surface unknown: used in 14 files (> 10)
- `@radix-ui/react-label`: 26 file(s), surface unknown: used in 26 files (> 10)
- `react-hook-form`: 26 file(s), surface unknown: used in 26 files (> 10)
- `@radix-ui/react-hover-card`: 12 file(s), surface unknown: used in 12 files (> 10)
- `input-otp`: 12 file(s), surface unknown: used in 12 files (> 10)
- `@radix-ui/react-menubar`: 12 file(s), surface unknown: used in 12 files (> 10)
- `@radix-ui/react-navigation-menu`: 12 file(s), surface unknown: used in 12 files (> 10)
- `@radix-ui/react-popover`: 14 file(s), surface unknown: used in 14 files (> 10)
- `@radix-ui/react-progress`: 12 file(s), surface unknown: used in 12 files (> 10)
- `@radix-ui/react-radio-group`: 14 file(s), surface unknown: used in 14 files (> 10)
- `react-resizable-panels`: 12 file(s), surface unknown: used in 12 files (> 10)
- `@radix-ui/react-scroll-area`: 14 file(s), surface unknown: used in 14 files (> 10)
- `@radix-ui/react-select`: 14 file(s), surface unknown: used in 14 files (> 10)
- `@radix-ui/react-separator`: 14 file(s), surface unknown: used in 14 files (> 10)
- `@radix-ui/react-slider`: 14 file(s), surface unknown: used in 14 files (> 10)
- `next-themes`: 12 file(s), surface unknown: used in 12 files (> 10)
- `sonner`: 12 file(s), surface unknown: used in 12 files (> 10)
- `@radix-ui/react-switch`: 14 file(s), surface unknown: used in 14 files (> 10)
- `@radix-ui/react-tabs`: 14 file(s), surface unknown: used in 14 files (> 10)
- `@radix-ui/react-toast`: 16 file(s), surface unknown: used in 16 files (> 10)
- `@radix-ui/react-toggle-group`: 14 file(s), surface unknown: used in 14 files (> 10)
- `@radix-ui/react-toggle`: 14 file(s), surface unknown: used in 14 files (> 10)
- `@radix-ui/react-tooltip`: 14 file(s), surface unknown: used in 14 files (> 10)
- `zustand`: 16 file(s), surface unknown: used in 16 files (> 10)
- `clsx`: 14 file(s), surface unknown: used in 14 files (> 10)
- `tailwind-merge`: 14 file(s), surface unknown: used in 14 files (> 10)
- `@workspace/api-client-react`: 24 file(s), surface unknown: used in 24 files (> 10)
- `react-dom`: 24 file(s), surface unknown: used in 24 files (> 10)
- `@hookform/resolvers`: 12 file(s), surface unknown: used in 12 files (> 10)
- `date-fns`: 86 file(s), surface unknown: used in 86 files (> 10)
- `zod`: 544 file(s), surface unknown: used in 544 files (> 10)
- `@replit/vite-plugin-cartographer`: 12 file(s), surface unknown: used in 12 files (> 10)
- `@replit/vite-plugin-dev-banner`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@replit/vite-plugin-runtime-error-modal`: 12 file(s), surface unknown: used in 12 files (> 10)
- `@tailwindcss/vite`: 14 file(s), surface unknown: used in 14 files (> 10)
- `@vitejs/plugin-react`: 14 file(s), surface unknown: used in 14 files (> 10)
- `vite`: 60 file(s), surface unknown: used in 60 files (> 10)
- `storage_client`: 52 file(s), surface ['get_artist_client', 'get_storage']: used in 52 files (> 10)
- `ai_model`: 344 file(s), surface ['AcceleratedTransformerLM', 'AssetIndex', 'AttentionTile', 'AwarenessUnavailable', 'BLOB', 'BPETokenizer', 'Blocked', 'CANDIDATES', 'CAPABILITY_POLICY', 'COLOR_SCHEMES', 'CONTROL_TOKENS', 'CTA_BANK', 'CUDANvcc', 'CUDARuntime', 'CandidateByteTokenizer', 'CandidateModel', 'CandidateTrainingBackend', 'CandidateTransformer', 'ComputeTile', 'CoverageAlert', 'CoverageWatchdog', 'CreativeDataset', 'CreativeModel', 'DOMAINS', 'DigitalGPU', 'DigitalGPUBackend', 'Dim3', 'EMBED_DIM', 'Engine', 'FP32', 'GPUCluster', 'GPUError', 'GemmTile', 'GenerateCoalescer', 'GenerationBrief', 'GenerationPlan', 'GlobalMemory', 'HyperCreativeTransformerLM', 'HyperFlashAttention', 'HyperGPU', 'HyperGPUBackend', 'HyperGPULinear', 'HyperLN', 'HyperLayerNorm', 'HyperLinearNL', 'HyperSIMDCore', 'HyperTransformerLM', 'INFERENCE_GATE', 'ImageEngine', 'ImageRequest', 'Instruction', 'InvalidOpcodeError', 'KVCache', 'LEASE_KEY', 'LICENSES', 'LiveModelUnavailable', 'MAX_AUDIO_SAMPLE_FRAMES', 'MAX_SOURCE_IMAGE_PIXELS', 'MAX_VIDEO_PIXEL_FRAMES', 'METRICS', 'MIN_ANCHORS', 'MIXED', 'MaxCoreOp', 'MaxCoreSilicon', 'MediaKernelError', 'MusicalTimeline', 'NEAREST_RADIUS', 'NativeCompiler', 'NativeKernels', 'OBSERVATIONS_PREFIX', 'OOMError', 'OPCODES', 'OWNER_ADMIN_GRANT', 'OpCode', 'OpRecord', 'OpcodeSpec', 'PALETTE_SLICE', 'PDIM', 'PDIMStateStore', 'PEAK_ARCHITECTURE', 'PEAK_POLICY', 'PLATFORMS', 'POINTER', 'PrecisionMode', 'Program', 'PublicContentTransformer', 'REGISTRY', 'ROOT', 'RenderCancelled', 'RequestScopedGPU', 'ResponseTooLarge', 'RetrievedAsset', 'SECRET', 'SIMDCore', 'SafeHTTPError', 'Scheduler', 'ScriptAgent', 'ScriptRequest', 'Section', 'ShapeError', 'ShapeMismatchError', 'SiliconScheduler', 'SimpleTokenizer', 'Snapshot', 'TTL', 'Telemetry', 'TrainConfig', 'TransformerLM', 'TypeErrorGPU', 'UnsupportedContentType', 'Utf8GenerationState', 'VRAM', 'VideoRequest', 'VisualDNA', '_FlashAttention', '_HyperLayerNorm', '_HyperSiLU', '_MixedPrecisionGEMM', '_NOTE_SEMI', '_PinnedHTTPConnection', '_PinnedHTTPSConnection', '_UPLOADS_DIR', '__dict__', '__new__', '_approved_text_training_rights', '_decode_prefix_payload', '_encode_prefix_payload', '_gen_cache', '_gradient_array', '_hyper_core', '_isolated_uploads', '_resolve_local_path', '_script_prompt', '_timestamp', '_to_rgb', '_valid_live_awareness_record', 'active_plan', 'analyze_audio', 'api', 'apply', 'apply_disclosure', 'apply_rope', 'apply_rope_offset', 'array', 'asset_pipeline', 'auto_select', 'awareness_from_direction', 'best_genre_hook_style', 'bind', 'body_candidates', 'bound_snapshot', 'bounded_text', 'brief_directives', 'brief_enrichment', 'build_brief', 'build_context', 'build_dna', 'build_manifest', 'candidate_registry', 'canonical', 'capabilities', 'capability_budget_seconds', 'capability_snapshot', 'check_inference_budget', 'choice', 'classify_result', 'commit_artifact', 'compose_caption', 'condition_background', 'conditioning', 'configured_sources', 'conv_wmma_sm102', 'create_candidate_adapter', 'creative_model', 'cta_candidates', 'current_gpu_instance', 'current_snapshot', 'decode_array', 'dedicated', 'dedup_cache', 'derive_palette', 'describe_image', 'detect_intent', 'digest', 'digital_gpu_hpss', 'digital_gpu_stft', 'dimensions', 'editing_pattern', 'eligibility', 'eligible_internal_bundle', 'eligible_records', 'encode_array', 'enforce', 'ensure_context_once', 'execute', 'extract_keywords', 'extract_technique', 'extract_text_from_item', 'fetch_bytes', 'fetch_to_file', 'finish_audio', 'finite_number', 'flash_attn_sm102', 'format_platform_optimization', 'from_arg', 'from_request', 'generate_synthetic_samples', 'generation_guard', 'genre_hook_candidates', 'get', 'get_asset_index', 'get_coverage_watchdog', 'get_engine', 'get_gpu_attn_calls', 'get_native_kernels', 'get_pocket_accelerator', 'get_safety', 'get_spec', 'graduate_hook', 'graduate_image_headline', 'hook_candidates', 'hyper_gpu_sizing', 'im2col_sm102', 'image_engine', 'image_headline_candidates', 'image_to_vector', 'incr', 'inference_deadline', 'ingest_generated_asset', 'is_enabled', 'items', 'landscape_feed', 'launch_kernel', 'legacy', 'load_candidate', 'load_checkpoint_archive', 'load_complete_checkpoint', 'make_default_silicon', 'make_training_record', 'media_gpu', 'mix_voiceover_over_music', 'music_targets', 'normalize', 'normalize_genres', 'normalize_platform', 'parent', 'parse', 'parse_feed_xml', 'peak_stream', 'platform_awareness_string', 'platform_hook_candidates', 'platform_hosts', 'precision', 'precompute_rope_freqs', 'producer_tools', 'profile_sourcing_quality_policy', 'quantize', 'quarantine_checkpoint', 'rank_scene_phrases', 'rank_signals', 'record_probe', 'reduction_current_sm102', 'reduction_redesigned_sm102', 'register', 'reject_semantic_controls', 'remove_private_asset_manifest', 'render_audio', 'render_image', 'render_video', 'request_intelligence', 'require_audio_stream', 'require_context', 'require_peak_training_rights', 'reset', 'rta', 'run_ffmpeg', 'safe_http', 'sample_all_scenes', 'sampling_context', 'sampling_seed', 'scene_phrase_templates', 'scene_phrases', 'search', 'select_representable_probe_prompt', 'selected_eligibility', 'self_sufficiency', 'separate_stems', 'set', 'sha256', 'slot', 'sm102_kernels', 'smoke_records', 'snapshot', 'snapshot_hash', 'sources', 'structure_score', 'summarize_quality_cohort', 'synthesize_voiceover', 'telemetry', 'tensor', 'test_phase4', 'test_pipeline', 'train', 'train_validated', 'training_root', 'validate_peak_record', 'validate_snapshot', 'validate_source_observation_document', 'veo_dna', 'verify_bundle', 'verify_finished_audio', 'verify_text_capability', 'verify_training_record', 'write_stem_wav']: used in 344 files (> 10)
- `pydantic`: 27 file(s), surface ['BaseModel', 'ConfigDict', 'Field', 'model_validator']: used in 27 files (> 10)
- `numpy`: 427 file(s), surface ['__version__', 'abs', 'add', 'all', 'allclose', 'any', 'append', 'arange', 'arctan2', 'argmax', 'argmin', 'argsort', 'array', 'array_equal', 'array_split', 'as_strided', 'asarray', 'ascontiguousarray', 'atleast_1d', 'bool_', 'broadcast_shapes', 'broadcast_to', 'ceil', 'clip', 'column_stack', 'concatenate', 'convolve', 'copyto', 'corrcoef', 'correlate', 'cos', 'count_nonzero', 'cross', 'cumprod', 'cumsum', 'diff', 'divide', 'dot', 'dstack', 'dtype', 'einsum', 'empty', 'empty_like', 'errstate', 'exp', 'fft', 'float16', 'float32', 'float64', 'floor', 'frombuffer', 'fromfile', 'full', 'full_like', 'gradient', 'hanning', 'histogram', 'hypot', 'inf', 'int16', 'int32', 'int64', 'int8', 'integer', 'interp', 'isfinite', 'isnan', 'isneginf', 'isposinf', 'issubdtype', 'ix_', 'lib', 'linalg', 'linspace', 'load', 'log', 'log10', 'log2', 'logical_and', 'matmul', 'max', 'maximum', 'mean', 'median', 'meshgrid', 'mgrid', 'min', 'minimum', 'moveaxis', 'multiply', 'nan', 'nan_to_num', 'ndarray', 'ndim', 'newaxis', 'ogrid', 'ones', 'ones_like', 'outer', 'pad', 'partition', 'percentile', 'pi', 'polyfit', 'power', 'prod', 'ptp', 'quantile', 'radians', 'random', 'reciprocal', 'repeat', 'resize', 'roll', 'round', 'savez_compressed', 'searchsorted', 'sign', 'signbit', 'sin', 'split', 'sqrt', 'square', 'squeeze', 'stack', 'std', 'subtract', 'sum', 'swapaxes', 'tan', 'tanh', 'tensordot', 'tile', 'transpose', 'triu', 'uint32', 'uint64', 'uint8', 'unique', 'vstack', 'where', 'zeros', 'zeros_like']: used in 427 files (> 10)
- `librosa`: 11 file(s), surface ['beat', 'ex', 'feature', 'fft_frequencies', 'frames_to_time', 'load', 'onset', 'resample', 'segment', 'stft', 'times_like', 'util']: used in 11 files (> 10)
- `torch`: 133 file(s), surface ['AdamW', 'Conv2d', 'Conv3d', 'ConvTranspose3d', 'CrossEntropyLoss', 'DataLoader', 'Dataset', 'DistributedDataParallel', 'Dropout', 'Embedding', 'GELU', 'Generator', 'GroupNorm', 'Identity', 'LayerNorm', 'Linear', 'Module', 'ModuleList', 'MultiheadAttention', 'Parameter', 'ReduceOp', 'Sequential', 'SiLU', 'Tensor', 'Upsample', '__version__', 'all_reduce', 'amp', 'arange', 'autocast', 'autograd', 'backends', 'bfloat16', 'bmm', 'bool', 'cat', 'channels_last', 'channels_last_3d', 'clamp', 'compile', 'complex128', 'complex64', 'conv2d', 'cos', 'cross_entropy', 'cuda', 'cumprod', 'destroy_process_group', 'device', 'dtype', 'empty', 'exp', 'float16', 'float32', 'float64', 'from_numpy', 'frombuffer', 'full', 'full_like', 'functional', 'get_num_threads', 'get_world_size', 'inference_mode', 'init', 'init_process_group', 'int16', 'int32', 'int64', 'int8', 'interpolate', 'is_initialized', 'isfinite', 'l1_loss', 'linear', 'linspace', 'load', 'log', 'long', 'manual_seed', 'matmul', 'mean', 'meshgrid', 'minimum', 'mse_loss', 'nn', 'no_grad', 'ones', 'optim', 'outer', 'pad', 'pi', 'rand', 'randint', 'randn', 'randn_like', 'random_split', 'relu', 'save', 'set_grad_enabled', 'set_num_interop_threads', 'set_num_threads', 'sigmoid', 'silu', 'sin', 'softmax', 'sqrt', 'stack', 'tanh', 'tensor', 'topk', 'triu', 'uint8', 'use_deterministic_algorithms', 'utils', 'version', 'where', 'zeros', 'zeros_like']: used in 133 files (> 10)
- `PIL`: 73 file(s), surface ['BICUBIC', 'BILINEAR', 'Draw', 'GaussianBlur', 'Image', 'ImageDraw', 'ImageEnhance', 'ImageFilter', 'ImageFont', 'ImageOps', 'LANCZOS', 'Quantize', 'Resampling', 'UnidentifiedImageError', 'alpha_composite', 'exif_transpose', 'fit', 'fromarray', 'load_default', 'new', 'open', 'truetype']: used in 73 files (> 10)
- `fastapi`: 29 file(s), surface ['APIRouter', 'Body', 'CORSMiddleware', 'Depends', 'FastAPI', 'HTTPException', 'Header', 'JSONResponse', 'PlainTextResponse', 'Query', 'Request', 'Response', 'StreamingResponse']: used in 29 files (> 10)
- `workers`: 17 file(s), surface ['APPLE_SONGS_URL', 'AlreadySeedingError', 'DEEZER_CHART_URL', 'HN_ADS_URL', 'HN_URL', 'MASTODON_TRENDS_STATUSES', 'YOUTUBE_FEEDS', '_TIMEOUT', '_fetch', 'fetch_bytes', 'get_flywheel', 'harvest', 'quality_harvester', 'seed', 'seed_audio_dataset']: used in 17 files (> 10)
- `requests`: 21 file(s), surface ['exceptions', 'get', 'post']: used in 21 files (> 10)
- `uvicorn`: 15 file(s), surface ['run']: used in 15 files (> 10)
- `datasets`: 7 file(s), surface ['load_dataset']: eligible
- `huggingface_hub`: 7 file(s), surface ['snapshot_download']: eligible
- `yt_dlp`: 10 file(s), surface ['YoutubeDL', 'utils']: eligible
- `diffusion`: 16 file(s), surface ['AudioSynthV2', 'CurriculumTrainer', 'DDPMScheduler', 'DOWNLOAD_PLAN', 'DPMSolver2M', 'KarrasSampler', 'LTXAdapter', 'MAX_REPLAY_CYCLES_PER_EPOCH', 'REPLAY_BATCH_SIZE', 'RealisticTimeSimulator', 'SCENARIO_INJECT_EVERY_N_STEPS', 'TextEncoder', 'TimeEncoder', 'TrainerV5', 'UNetV4', '_BURST_YEAR_WEIGHT', '_COND_DIM_V4', '_INTERP_YEAR_WEIGHT', '_REPLAY_YEAR_WEIGHT', '_TEXT_ENC_DIM_V4', '_TIME_ENC_DIM_V4', '_YEAR_EQUIV_STEPS_PER_MINUTE', '__new__', '_fmt_years', '_load_v4', 'get_bridge', 'get_engine', 'get_memory', 'load_engine_v2', 'load_engine_v2_full', 'tokenize', 'tokenize_v3', 'train_v4']: used in 16 files (> 10)
- `psutil`: 4 file(s), surface ['cpu_percent', 'virtual_memory']: eligible
- `trusted_http`: 8 file(s), surface ['request', 'validated_origin']: eligible
- `urllib3`: 4 file(s), surface ['PoolManager', 'Retry', 'Timeout']: eligible
- `esbuild`: 64 file(s), surface unknown: used in 64 files (> 10)
- `compression`: 16 file(s), surface unknown: used in 16 files (> 10)
- `cors`: 26 file(s), surface unknown: used in 26 files (> 10)
- `express`: 1361 file(s), surface unknown: used in 1361 files (> 10)
- `express-rate-limit`: 86 file(s), surface unknown: used in 86 files (> 10)
- `undici`: 30 file(s), surface unknown: used in 30 files (> 10)
- `@workspace/api-zod`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `fast-xml-parser`: 30 file(s), surface unknown: used in 30 files (> 10)
- `chokidar`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `fast-glob`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `orval`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `drizzle-kit`: 8 file(s), surface unknown: automatic replacement is only supported for Python projects
- `drizzle-orm`: 1908 file(s), surface unknown: used in 1908 files (> 10)
- `pg`: 70 file(s), surface unknown: used in 70 files (> 10)
- `drizzle-zod`: 8 file(s), surface unknown: automatic replacement is only supported for Python projects
- `puppeteer-core`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `sharp`: 62 file(s), surface unknown: used in 62 files (> 10)
- `@shared/schema`: 1548 file(s), surface unknown: used in 1548 files (> 10)
- ` + typeOnly + clauseBits.join(`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `typescript`: 57 file(s), surface unknown: used in 57 files (> 10)
- `model`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `router`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `axum`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `boosterstate`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `serde`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `tokio`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `tower_http`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@capacitor/cli`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@/contexts`: 80 file(s), surface unknown: used in 80 files (> 10)
- `@shared/adminAccessPolicy.mjs`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `worker-timers`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `react-i18next`: 8 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@uppy/aws-s3`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@uppy/core`: 8 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@uppy/dashboard`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@uppy/react`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@shared/types`: 18 file(s), surface unknown: used in 18 files (> 10)
- `@dnd-kit/core`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@dnd-kit/sortable`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@dnd-kit/utilities`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@shared/passwordPolicy`: 8 file(s), surface unknown: automatic replacement is only supported for Python projects
- `qrcode`: 14 file(s), surface unknown: used in 14 files (> 10)
- `@shared/domainValidation`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@tanstack/react-query-persist-client`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `canvas-confetti`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@shared/apiKeyScopes`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@icons-pack/react-simple-icons`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@/stores`: 18 file(s), surface unknown: used in 18 files (> 10)
- `tone`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `pixi.js`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `reactflow`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `nanoid`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@/audio`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `i18next`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `i18next-browser-languagedetector`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/BasePlugin`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/ChorusPlugin`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/CompressorPlugin`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/DeEsserPlugin`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/DelayPlugin`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/DistortionPlugin`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/DynamicEQPlugin`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/EQPlugin`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/FlangerPlugin`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/PhaserPlugin`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/ReverbPlugin`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/VocoderPlugin`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `idb`: 8 file(s), surface unknown: automatic replacement is only supported for Python projects
- `web-vitals`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@sentry/react`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@/data`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `jspdf`: 44 file(s), surface unknown: used in 44 files (> 10)
- `jspdf-autotable`: 42 file(s), surface unknown: used in 42 files (> 10)
- `howler`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@shared/agePolicy`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@stripe/react-stripe-js`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@stripe/stripe-js`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `maxmind`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `dotenv`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `fastify`: 8 file(s), surface unknown: automatic replacement is only supported for Python projects
- `github.com/miekg/dns`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `github.com/jackc/pgx/v5/pgxpool`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `electron`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@eslint/js`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@typescript-eslint/eslint-plugin`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@typescript-eslint/parser`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `eslint-plugin-react-hooks`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `server`: 8 file(s), surface ['AudioMasteringRecommendationRequest', 'HTTPStatusError', 'Response', 'ResponseTooLarge', 'UnsafeURL', '_creative_model', '_hyper_backend', '_init_ai_model', '_model_init_error', '_model_ready', '_tokenizer', '_validate_addresses', 'audio_mastering_recommendation', 'request']: API surface of 14 symbols (> 12): too large to rebuild safely
- `@workspace/db`: 24 file(s), surface unknown: used in 24 files (> 10)
- `@replit/object-storage`: 28 file(s), surface unknown: used in 28 files (> 10)
- `@msgpack/msgpack`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `multer`: 14 file(s), surface unknown: used in 14 files (> 10)
- `pdfkit`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `ws`: 38 file(s), surface unknown: used in 38 files (> 10)
- `gdb`: 24 file(s), surface ['TYPE_CODE_INT', 'TYPE_CODE_PTR', 'TYPE_CODE_STRUCT', 'TYPE_CODE_UNION', 'Type', 'VERSION', 'Value', 'ValuePrinter', 'current_objfile', 'lookup_type', 'parse_and_eval', 'printing', 'selected_inferior']: used in 24 files (> 10)
- `gdb_lookup`: 8 file(s), surface ['register_printers']: eligible
- `gdb_providers`: 8 file(s), surface ['*']: eligible
- `rust_types`: 24 file(s), surface ['*', 'EMPTY', 'ENUM', 'OTHER', 'REGULAR_ENUM', 'RustType', 'SINGLETON_ENUM', 'STD_ARC', 'STD_CELL', 'STD_HASH_MAP', 'STD_HASH_SET', 'STD_NONZERO_NUMBER', 'STD_OS_STRING', 'STD_PATH', 'STD_PATHBUF', 'STD_RC', 'STD_REF', 'STD_REF_CELL', 'STD_REF_MUT', 'STD_SLICE', 'STD_STR', 'STD_STRING', 'STD_VEC', 'STD_VEC_DEQUE', 'STRUCT', 'STRUCT_VARIANT', 'TUPLE', 'TUPLE_VARIANT', 'classify_struct', 'classify_union', 'is_tuple_fields']: used in 24 files (> 10)
- `lldb`: 16 file(s), surface ['CreateDataFromSInt64Array', 'CreateDataFromUInt64Array', 'SBData', 'SBError', 'SBTarget', 'SBType', 'SBTypeCategory', 'SBTypeNameSpecifier', 'SBTypeStaticField', 'SBTypeSummary', 'SBValue', 'debugger', 'eBasicTypeLong', 'eBasicTypeUnsignedChar', 'eBasicTypeUnsignedLong', 'eFormatChar', 'eTypeClassStruct', 'eTypeClassUnion']: used in 16 files (> 10)
- `lldb_providers`: 8 file(s), surface ['*']: eligible
- `team`: 6 file(s), surface ['build_plan', 'execute_plan', 'regular_file', 'safe_relative', 'validate_settings']: eligible
- `verify`: 6 file(s), surface ['REQUIRED', 'cancel', 'controller_identity', 'digest', 'finite_number', 'generated_path', 'git', 'observe', 'read', 'run', 'snapshot', 'source_identity', 'target_ready', 'valid_argv', 'validate', 'write']: API surface of 16 symbols (> 12): too large to rebuild safely
- `admin_release`: 4 file(s), surface ['MANIFEST', 'collect', 'finalize']: eligible
- `repair`: 4 file(s), surface ['new_generated_test', 'protected', 'repair']: eligible
- `vitest`: 18 file(s), surface unknown: used in 18 files (> 10)
- `bcrypt`: 38 file(s), surface unknown: security-sensitive (crypto/auth/TLS): never rebuilt in-house automatically
- `express-session`: 40 file(s), surface unknown: used in 40 files (> 10)
- `libphonenumber-js`: 14 file(s), surface unknown: used in 14 files (> 10)
- `stripe`: 138 file(s), surface unknown: used in 138 files (> 10)
- `twilio`: 30 file(s), surface unknown: used in 30 files (> 10)
- `@jridgewell/trace-mapping`: 14 file(s), surface unknown: used in 14 files (> 10)
- `ast-v8-to-istanbul`: 12 file(s), surface unknown: used in 12 files (> 10)
- `istanbul-lib-coverage`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `istanbul-lib-report`: 10 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@vitest/coverage-v8`: 10 file(s), surface unknown: automatic replacement is only supported for Python projects
- `common`: 80 file(s), surface ['ROOT', 'clean_environment', 'coverage_parse_exclusions', 'run_command', 'sanitize', 'source_inputs', 'source_revision', 'write_json']: used in 80 files (> 10)
- `@neondatabase/serverless`: 32 file(s), surface unknown: used in 32 files (> 10)
- `node-cron`: 58 file(s), surface unknown: used in 58 files (> 10)
- `otplib`: 16 file(s), surface unknown: used in 16 files (> 10)
- `archiver`: 34 file(s), surface unknown: used in 34 files (> 10)
- `ffmpeg-static`: 56 file(s), surface unknown: used in 56 files (> 10)
- `fluent-ffmpeg`: 56 file(s), surface unknown: used in 56 files (> 10)
- `yjs`: 23 file(s), surface unknown: used in 23 files (> 10)
- `cookie-parser`: 10 file(s), surface unknown: automatic replacement is only supported for Python projects
- `ioredis`: 20 file(s), surface unknown: used in 20 files (> 10)
- `bullmq`: 52 file(s), surface unknown: used in 52 files (> 10)
- `helmet`: 20 file(s), surface unknown: used in 20 files (> 10)
- `express-validator`: 10 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@sendgrid/mail`: 24 file(s), surface unknown: used in 24 files (> 10)
- `axios`: 92 file(s), surface unknown: used in 92 files (> 10)
- `twitter-api-v2`: 22 file(s), surface unknown: used in 22 files (> 10)
- `@tensorflow/tfjs`: 80 file(s), surface unknown: used in 80 files (> 10)
- `cookie`: 19 file(s), surface unknown: used in 19 files (> 10)
- `connect-pg-simple`: 8 file(s), surface unknown: automatic replacement is only supported for Python projects
- `memoizee`: 8 file(s), surface unknown: automatic replacement is only supported for Python projects
- `openid-client`: 8 file(s), surface unknown: automatic replacement is only supported for Python projects
- `passport`: 8 file(s), surface unknown: security-sensitive (crypto/auth/TLS): never rebuilt in-house automatically
- `@sentry/node`: 10 file(s), surface unknown: automatic replacement is only supported for Python projects
- `acme-client`: 8 file(s), surface unknown: automatic replacement is only supported for Python projects
- `wavefile`: 40 file(s), surface unknown: used in 40 files (> 10)
- `fft.js`: 12 file(s), surface unknown: used in 12 files (> 10)
- `music-metadata`: 20 file(s), surface unknown: used in 20 files (> 10)
- `node-wav`: 10 file(s), surface unknown: automatic replacement is only supported for Python projects
- `exceljs`: 14 file(s), surface unknown: used in 14 files (> 10)
- `xmlbuilder2`: 10 file(s), surface unknown: automatic replacement is only supported for Python projects
- `web-push`: 20 file(s), surface unknown: used in 20 files (> 10)
- `dns-packet`: 10 file(s), surface unknown: automatic replacement is only supported for Python projects
- `dns2`: 10 file(s), surface unknown: automatic replacement is only supported for Python projects
- `node-fetch`: 10 file(s), surface unknown: automatic replacement is only supported for Python projects
- `resend`: 42 file(s), surface unknown: used in 42 files (> 10)
- `tweetnacl`: 8 file(s), surface unknown: automatic replacement is only supported for Python projects
- `jsonwebtoken`: 10 file(s), surface unknown: security-sensitive (crypto/auth/TLS): never rebuilt in-house automatically
- `@shared/config`: 12 file(s), surface unknown: used in 12 files (> 10)
- `swagger-jsdoc`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `swagger-ui-express`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `essentia.js`: 10 file(s), surface unknown: automatic replacement is only supported for Python projects
- `<spec>`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `spec`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `file:`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@electron/asar`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `junit_evidence`: 4 file(s), surface ['read_cases']: eligible
- `ignore`: 8 file(s), surface unknown: automatic replacement is only supported for Python projects
- `pip`: 4 file(s), surface ['Marker', 'Requirement', 'canonicalize_name']: eligible
- `CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_import_jobs_user_idx ON catalog_import_jobs(user_id, created_at)`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `starlette`: 2 file(s), surface ['Request']: eligible
- `x`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@maxbooster/electron-download-transport`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `eslint`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `pkg`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `…`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `https-proxy-agent`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `dd-trace`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `newrelic`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `csv-parse`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `graphql`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `prom-client`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@shared/domainValidation.js`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@peculiar/x509`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `digitalgpu`: 15 file(s), surface ['get_gpu', 'gpu_info']: used in 15 files (> 10)
- `scipy`: 9 file(s), surface ['convolve2d', 'gaussian_filter']: eligible
- `cv2`: 3 file(s), surface ['CAP_PROP_FRAME_COUNT', 'CAP_PROP_POS_FRAMES', 'COLOR_BGR2RGB', 'VideoCapture', 'cvtColor']: eligible
- `frameGenerator`: 3 file(s), surface ['generate_frame']: eligible
- `av`: 12 file(s), surface ['VideoFrame', 'open']: used in 12 files (> 10)
- `audioflux`: 3 file(s), surface ['BFT', 'type']: eligible
- `dask`: 3 file(s), surface ['Client', 'compute', 'delayed']: eligible
- `h5py`: 3 file(s), surface ['File', 'string_dtype']: eligible
- `diffusers`: 3 file(s), surface ['LTXVideoConditioningPipeline', 'from_pretrained']: eligible
- `videoNeuralNet`: 2 file(s), surface ['predict_visual_params']: eligible
- `@labelgrid/core`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `googleapis`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@tensorflow/tfjs-node`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `tailwindcss`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `tools`: 8 file(s), surface ['CudaRuntimeShim', 'Dim3', 'WARP_SIZE', 'cudaMemcpyDeviceToHost', 'cudaMemcpyHostToDevice', 'cudaMemcpyKind', 'dummy_kernel', 'launch_kernel', 'launch_warp_kernel', 'reduction_redesigned_sm102_kernel', 'reduction_redesigned_sm102_kernel_warp', 'warp_shfl_down_vec']: eligible
- `scheduler`: 2 file(s), surface ['VGPUTimeSlicer']: eligible
- `infer`: 4 file(s), surface ['DDIMSampler', 'DigitalGPUPostProcessor', 'SCENE_PRESETS', 'VideoGenerationPipeline', 'get', 'get_corpus_bridge', 'get_training_state', 'is_trained', 'keys', 'simulated_years']: eligible
- `models`: 8 file(s), surface ['LatentDiffusionVideo', 'MusicConditioner', 'NoiseScheduler', 'SRUNet3D', 'STYLE_NAME_TO_ID', 'TextConditioner', 'VideoDiT', 'VideoVAE3D', 'emotional_heat_from_label', 'get']: eligible
- `torchvision`: 2 file(s), surface ['write_video']: eligible
- `utils`: 12 file(s), surface ['cleanup_ddp', 'compile_fn', 'get_digital_gpu', 'get_logger', 'gpu_status', 'is_main', 'load_checkpoint', 'save_checkpoint', 'setup_ddp']: used in 12 files (> 10)
- `yaml`: 6 file(s), surface ['safe_load']: eligible
- `data`: 4 file(s), surface ['CaptionedVideoDataset', 'VideoDataset', 'VideoTransform']: eligible
- `mediasoup-client`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `anthropic`: 2 file(s), surface ['APIConnectionError', 'APIStatusError', 'Anthropic']: eligible
- `@anthropic-ai/sdk`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `tsx`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `cookie-signature`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `mediasoup`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects

## Modules

### `.pdim-cluster-test-Pidv4k/cluster-fixture.mjs`

(analysis failed: ValueError)


### `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py`

A NumPy-based emulation layer for CUDA's execution model (the 'digital GPU'). It supplies dim3, shared memory, warp shuffle/reduce, atomics, math and fp16 intrinsics, and a per-block CUDARuntime context. A launch_kernel helper loops over the grid and calls one vectorised Python kernel function per block. SM102 kernel implementations are written against it. The module docstring states it is not a CUDA interpreter.

- `Dim3` [complete/high]: Mirror CUDA's dim3 (x, y, z) triple for thread, block and grid dimensions.
- `Dim3.__init__` [complete/high]: Store the three dimension components with CUDA-style defaults of 1.
- `Dim3.from_arg` [complete/high]: Coerce a launch argument (Dim3, int, or tuple/list) into a Dim3, as CUDA launch configs accept.
- `Dim3.__repr__` [complete/high]: Readable debug string for the dims.
- `Dim3.volume` [complete/medium]: Total element count (x*y*z), e.g. threads per block or blocks per grid.
- `SharedMemory` [complete/high]: Model a block's fixed-size float32 __shared__ scratchpad.
- `SharedMemory.__init__` [complete/high]: Allocate a zero-initialised float32 buffer of n_floats elements.
- `SharedMemory.view` [complete/high]: Return a slice view of the buffer so kernels can work on a sub-region in place.
- `SharedMemory.__getitem__` [complete/high]: Index or slice read access to the buffer.
- `SharedMemory.__setitem__` [complete/high]: Index or slice write access to the buffer.
- `SharedMemory.reset` [complete/medium]: Zero the whole scratchpad so it can be reused.
- `SharedMemory.nbytes` [complete/medium]: Report the buffer's size in bytes.
- `WarpState` [partial/medium]: Model one 32-lane warp and provide shuffle-down and reduction primitives.
- `WarpState.__init__` [complete/high]: Create a zeroed 32-lane float32 register and optionally preload it.
- `WarpState.load` [complete/medium]: Overwrite the leading lanes of the warp register with new values.
- `WarpState.shfl_down_sync` [partial/high]: Perform one butterfly reduction step of a warp reduction. Each lane adds the value from lane+offset, and lanes with no source keep their own value.
- `WarpState.reduce_sum` [complete/high]: Compute a full-warp horizontal sum with a log2(32) shuffle-down loop.
- `_AtomicFloat` [dead/medium]: Thread-safe float32 scalar accumulator modelling atomicAdd on a scalar.
- `_AtomicFloat.__init__` [dead/medium]: Initialise the float32 value and its lock.
- `_AtomicFloat.add` [dead/medium]: Atomically add delta to the accumulator.
- `_AtomicFloat.value` [dead/medium]: Read the current value as a Python float.
- `_AtomicFloat.reset` [dead/medium]: Reset the accumulator to zero.
- `atomic_add` [complete/high]: Emulate CUDA atomicAdd on an array element: arr[idx] += delta.
- `CUDARuntime` [complete/high]: Per-block execution context passed to kernel functions. It exposes thread, block and grid indices, shared memory, sync, warp, atomic and math intrinsics.
- `CUDARuntime.__init__` [complete/high]: Store the launch coordinates and lazily allocate shared memory and a warp state.
- `CUDARuntime.shared` [complete/high]: Return the block's shared memory, allocating or growing it to at least n_floats (the analogue of a __shared__ declaration).
- `CUDARuntime.syncthreads` [complete/high]: Stand-in for the __syncthreads() barrier. It is unnecessary because each block runs as a single sequential, vectorised call.
- `CUDARuntime.shfl_down_sync` [complete/high]: Delegate to WarpState.shfl_down_sync.
- `CUDARuntime.warp_reduce_sum` [complete/high]: Delegate to WarpState.reduce_sum for a warp-wide sum.
- `CUDARuntime.atomic_add` [complete/high]: Method wrapper over the module-level atomic_add.
- `CUDARuntime.rsqrtf` [complete/medium]: Reciprocal square root, mirroring CUDA's rsqrtf.
- `CUDARuntime.expf` [complete/high]: Single-precision exponential, mirroring CUDA's expf.
- `CUDARuntime.fmaxf` [complete/medium]: Return the maximum of two floats, mirroring CUDA's fmaxf.
- `CUDARuntime.float2half` [complete/high]: Convert an array to float16, like CUDA's float-to-half intrinsic.
- `CUDARuntime.half2float` [complete/high]: Convert an array to float32, like CUDA's half-to-float intrinsic.
- `launch_kernel` [complete/high]: Emulate a CUDA <<<grid, block>>> launch by looping over every block index (z, y, x order) and calling the Python kernel once per block with a fresh CUDARuntime.

### `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py`

Defines the abstract Backend interface for the DigitalGPU/maxcore runtime: a set of abstract primitive kernels (tensor creation, gemm, add, relu, softmax, attention, conv2d, mlp, reduce) plus default availability, op-support and info helpers. Concrete backends (digital, GPU, cluster, ASIC) subclass it so the runtime can dispatch IR ops interchangeably.

- `Backend` [complete/high]: Abstract base class (ABC) that is the contract for every DigitalGPU backend. Declares the primitive kernel methods as abstract and provides default introspection helpers. It is not meant to be instantiated.
- `Backend.create_tensor` [stub/high]: Abstract hook to convert raw data (list/array-like) into a backend-native tensor of the given dtype.
- `Backend.gemm` [stub/high]: Abstract general matrix multiply a @ b, with optional bias addition and optional fused activation.
- `Backend.add` [stub/high]: Abstract element-wise addition of two tensors.
- `Backend.relu` [stub/high]: Abstract element-wise ReLU activation.
- `Backend.softmax` [stub/high]: Abstract softmax along a given axis.
- `Backend.attention` [stub/high]: Abstract scaled dot-product attention over q, k, v with optional mask and causal masking.
- `Backend.conv2d` [stub/high]: Abstract 2D convolution with optional bias, stride and padding.
- `Backend.mlp` [stub/medium]: Abstract fused two-layer MLP: activation(x@w1+b1)@w2+b2.
- `Backend.reduce` [stub/high]: Abstract reduction over an axis, with the op chosen by name (e.g. sum/mean/max).
- `Backend.is_available` [complete/high]: Report whether the backend can actually run on the current host. The default returns True; backends needing hardware (GPU etc.) override it.
- `Backend.supports` [complete/medium]: Report whether the backend supports a given op by name. The base default says every op is supported; subclasses can restrict.
- `Backend.info` [complete/high]: Return a small descriptor dict of the backend (name and availability) for diagnostics like smi output and benchmarks.

### `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py`

Declares honest, non-functional plug-points for future Backend implementations (cluster and ASIC). They report unavailable and raise NotImplementedError with a documented contract for every kernel, so the registry, runtime and API stay backend-agnostic without faking functionality.

- `_FutureBackend` [stub/high]: Abstract base for not-yet-implemented backends. It reports unavailability and routes every Backend kernel method to a NotImplementedError carrying the subclass's contract text.
- `_FutureBackend.is_available` [complete/high]: Report that this backend cannot be used on this host, so backend selection skips it.
- `_FutureBackend._nyi` [complete/high]: Central helper that raises a NotImplementedError naming the backend, the operation and the contract a real implementation must satisfy.
- `_FutureBackend.create_tensor` [stub/high]: Placeholder for the Backend tensor-creation kernel. It deliberately fails with NotImplementedError.
- `_FutureBackend.gemm` [stub/high]: Placeholder for matrix multiply on a future backend. It raises NotImplementedError.
- `_FutureBackend.add` [stub/high]: Placeholder for the elementwise add kernel. It raises NotImplementedError.
- `_FutureBackend.relu` [stub/high]: Placeholder for the ReLU kernel. It raises NotImplementedError.
- `_FutureBackend.softmax` [stub/high]: Placeholder for the softmax kernel. It raises NotImplementedError.
- `_FutureBackend.attention` [stub/high]: Placeholder for the attention kernel. It raises NotImplementedError.
- `_FutureBackend.conv2d` [stub/high]: Placeholder for the 2D convolution kernel. It raises NotImplementedError.
- `_FutureBackend.mlp` [stub/high]: Placeholder for the fused MLP kernel. It raises NotImplementedError.
- `_FutureBackend.reduce` [stub/high]: Placeholder for the reduce kernel. It raises NotImplementedError.
- `ClusterBackend` [stub/high]: Named plug-point for a multi-node backend. Its contract is to partition the MaxCoreGraph across nodes over RPC, shard the KV-cache, and all-reduce at BARRIER ops, with each shard running a device backend locally.
- `ASICBackend` [stub/high]: Named plug-point for an ASIC backend. Its contract is to lower MaxCore IR to ASIC microcode that drives DMA engines, an on-chip KV-cache and specialized tensor units.

### `.task123-publishing-candidate/.pdim-cluster-test-Pidv4k/cluster-fixture.mjs`

This is an esbuild-bundled ESM file, `cluster-fixture.mjs`, that sits in a temporary PDIM cluster-test directory. It inlines much of the Max Booster server: log sanitization, a PDIM/Redis-compatible client with circuit breaker and adaptive queueing, compression engines such as xz/zstd/brotli, container and pocket codecs, worker/compute sizing, the local PDIM store with persistence and Pub/Sub streaming, and PDIM recovery and snapshot authority logic. Only a few excerpts are visible. Entries with no visible body are inferred from names only, with low confidence. The 'callers' lists in the inventory point to unrelated Python files and are name collisions, so they say nothing about how these JS functions are actually used.

- `__esm` [complete/high]: esbuild helper that wraps a module initializer in a lazy, run-once function (`__init`). The result is cached, and a thrown error is remembered and rethrown on later calls.
- `__init` [complete/high]: The inner lazy initializer returned by `__esm`. It executes the wrapped module body once, caches the result, and rethrows a cached error on later calls.
- `__export` [complete/high]: esbuild helper that defines enumerable getter properties on a target so a bundled module's namespace exports stay live bindings.
- `sanitizeLogText` [complete/high]: Redact secrets and PII from a log string. It covers Bearer/Basic tokens, password/secret/token/api-key assignments, email addresses, and IPv4/IPv6 addresses.
- `sanitizeLogValue` [complete/high]: Recursively produce a log-safe copy of an arbitrary value. Strings are sanitized, sensitive keys are redacted, and Errors are flattened. Cycles, depth, array length and key count are bounded.
- `runPiped` [complete/high]: Run the `xz` CLI with the given args, feed the input buffer to stdin, and collect stdout as a Buffer. It rejects with a truncated stderr message on a non-zero exit.
- `limitFile` [complete/high]: Read and trim a cgroup limit file. Returns null if it is missing (ENOENT/ENOTDIR) and rethrows other errors.
- `effectiveCapacity` [complete/high]: Compute the container-aware CPU count and memory in GiB. It takes the minimum of the OS-reported values and the cgroup v2/v1 limits.
- `positiveConfig` [complete/high]: Read a numeric env var, falling back to a default, and require it to be a positive finite number. Otherwise it throws.
- `computeWorkerSizing` [complete/high]: Decide how many cluster workers to run and how much memory and heap each gets. It uses cgroup-aware capacity, reserves headroom, primary, sidecar and python memory, and splits the remainder between app workers and MaxCore workers (70/30 when MAXCORE_LOCAL is on). It honors an env override and a maxWorkers cap, and throws if the budget is insufficient.
- `getLocalPdimUrl` [complete/high]: Build the loopback exec URL of the local in-process PDIM server.
- `isLocalPdimServerOwnedByThisProcess` [complete/high]: Check that this process has a listening local PDIM HTTP server bound to 127.0.0.1:LOCAL_PORT.
- `assertLocalPdimSnapshotAuthority` [complete/high]: Guard that the configured PDIM exec backend is this process's owned local store before a snapshot is taken. Throws if the URL is invalid, the server is not listening on loopback, the port, origin or path differ, or the source path is not the expected persistence file.
- `openConsistentLocalPdimSnapshot` [complete/high]: Produce a pinned, consistent read-only handle on the local PDIM persistence file for recovery or backup. It verifies authority, synchronously commits the store, checks the file is a regular non-symlink, opens an fd, and verifies the inode is stable.
- `openLocalPubSubStream` [complete/high]: Stream local PDIM Pub/Sub events to an HTTP response as NDJSON. It sends a ready event and a 15s heartbeat, applies backpressure with a 1 MiB buffer cap, and cleans up on abort or client disconnect.
- `openLocalPubSubStream.unsubscribe` [complete/high]: Placeholder no-op unsubscribe that is replaced by the real unsubscribe function returned from `canonicalStore.subscribePubSub`. It lets dispose run safely before subscription.
- `openLocalPubSubStream.dispose` [complete/high]: Idempotently tear down the stream. It removes listeners, clears the heartbeat, unsubscribes, and clears the pending buffer.
- `openLocalPubSubStream.flush` [complete/high]: On a 'drain' event, write queued NDJSON lines until the socket blocks again.
- `openLocalPubSubStream.closeStream` [complete/high]: Abort the request controller to close the stream, for example on buffer overflow or subscription close.
- `openLocalPubSubStream.onAbort` [complete/high]: Abort handler. Disposes the stream and ends the response if it is still writable.
- `openLocalPubSubStream.onResponseClose` [complete/high]: Handle client disconnect. Abort the controller if the response never ended normally, then dispose.
- `openLocalPubSubStream.send` [complete/high]: Serialize an event as an NDJSON line and write it, or queue it if blocked. If the queue exceeds 1 MiB it closes the stream.
- `startLocalPdimServer` [unclear/low]: Start the local PDIM HTTP server, which only the cluster primary may own. It rejects when called in a worker. The remainder of the body is not visible; given its size, its role is plausibly to load persisted state, listen on loopback, and register shutdown saves.
- `saveStore / saveStoreAsync / loadStore / validatePersistedEntry / normalizePersistedStreamFields / expired` [unclear/low]: Persistence layer for the local PDIM store. Names suggest saving synchronously or asynchronously to PERSIST_FILE, loading and validating entries, normalizing stream fields, and expiry checks. `saveStore` returns truthy on success (used by openConsistentLocalPdimSnapshot). The loader throws on a corrupt file rather than losing data silently, per the visible catch block.
- `cbRecordFailure / cbRecordSuccess / cbAllowRequest / cbIsOpen / cbGetState / cbForceClose / cbHalfOpenFailed / _inGracePeriod / _inSlowLane` [unclear/low]: Circuit-breaker state machine for the PDIM remote client, covering failure/success recording, request admission, open/half-open state and forced close, with grace-period and slow-lane helpers. Inferred from names only.
- `execLuaViaPdim / syncRedisCall / makeCmsgpack / _normalizeLuaResult / _replaceNulls / _acquireWorkerSlot / _releaseWorkerSlot / _luaComputeBackoff / _enqueueExec / _enqueueScriptExec / _enqueueBlockingExec / startPdimDirectProber / setPdimGapFloor and related getters` [unclear/low]: PDIM client plumbing: executing Lua scripts over the PDIM HTTP exec endpoint, rate-limit adaptive gap, queueing with depth metrics, L1 cache read/write/evict, error logging, a direct-path prober, and msgpack helpers. Inferred from names only.
- `detectMagicFormat / matchesSignature / isRiffWebp / shannonEntropy / looksLikeText / qualityFor / zstdLevelFor / brotliCompressBytes / runZstdPiped / runZstdArgs / checkXz` [unclear/low]: Compression-fabric helpers: magic-byte format detection, entropy and text heuristics, level selection, and invoking brotli, zstd or xz codecs. `checkXz` presumably probes xz CLI availability and caches it in `xzAvailable`.
- `recovery and bucket functions (createRecoveryStorage, assertSafeBucketId, verifyManagedPrivateStorage, uploadCreateOnly, downloadAndVerify, retainAndReadBackPdimSnapshot, runActualClassVerifier, assertMatchingPdimRecoveryEvidence, copyPinnedSnapshot, initializePdimRecoveryAuthority, handlePdimRecoveryAuthorityRequest, requestAuthority)` [unclear/low]: PDIM disaster-recovery pipeline. It uploads a pinned local snapshot create-only to managed private bucket storage, downloads and verifies it, cross-checks recovery evidence, and exposes an authority HTTP handler. Inferred from names only.

### `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py`

A pure-Python/NumPy emulation substrate for CUDA's execution model, used by the SM102 kernel implementations on the 'digital GPU'. It provides dim3, per-block shared memory, warp shuffle/reduction primitives, atomics, math and half-precision intrinsics, a per-block CUDARuntime context, and a sequential launch_kernel loop over the grid. It is explicitly not a CUDA interpreter. Kernels are Python functions that are vectorised over threads and called once per block (module docstring, launch_kernel docstring).

- `Dim3` [complete/high]: Mirror CUDA's dim3: an (x, y, z) triple used for thread, block and grid dimensions and indices.
- `Dim3.__init__` [complete/high]: Store x, y, z, defaulting each to 1.
- `Dim3.from_arg` [complete/high]: Coerce a launch argument (a Dim3, an int, or a tuple/list of up to 3 ints) into a Dim3, as in CUDA's <<<grid, block>>> syntax.
- `Dim3.__repr__` [complete/high]: Readable debug representation.
- `Dim3.volume` [complete/high]: Total element count, x*y*z (threads per block or blocks per grid).
- `SharedMemory` [complete/high]: Model a block's __shared__ memory as a fixed-size float32 scratchpad.
- `SharedMemory.__init__` [complete/high]: Allocate a zero-initialised float32 buffer of n_floats elements.
- `SharedMemory.view` [complete/high]: Return a writable slice view of the buffer so kernels can work on sub-regions, e.g. m_i = shm.view(0, T).
- `SharedMemory.__getitem__` [complete/high]: Index into the scratchpad with array-style access.
- `SharedMemory.__setitem__` [complete/high]: Assign into the scratchpad with array-style access.
- `SharedMemory.reset` [complete/high]: Zero the entire scratchpad.
- `SharedMemory.nbytes` [complete/high]: Report the scratchpad size in bytes.
- `WarpState` [partial/medium]: Model a 32-lane warp's register state and warp-level primitives (shuffle-down, horizontal sum).
- `WarpState.__init__` [complete/high]: Create a zeroed 32-lane float32 register file, optionally preloaded from lane_values.
- `WarpState.load` [complete/high]: Overwrite the leading lanes of the warp's stored values.
- `WarpState.shfl_down_sync` [partial/medium]: Emulate one step of a butterfly shuffle-down reduction across all 32 lanes at once. Each lane gets its own value plus the value from lane+offset, and lanes whose source is out of range keep their own value.
- `WarpState.reduce_sum` [complete/high]: Compute a full warp horizontal sum with log2(32) shuffle-down steps (offsets 16, 8, 4, 2, 1).
- `_AtomicFloat` [dead/medium]: Thread-safe scalar float32 accumulator modelling atomicAdd on a scalar.
- `_AtomicFloat.__init__` [complete/high]: Initialise the float32 value and its lock.
- `_AtomicFloat.add` [complete/high]: Lock-protected accumulate of delta into the value.
- `_AtomicFloat.value` [complete/high]: Read the current accumulated value as a Python float.
- `_AtomicFloat.reset` [complete/high]: Set the accumulator back to 0.
- `atomic_add` [complete/high]: Emulate CUDA atomicAdd on a numpy array element, in place.
- `CUDARuntime` [complete/high]: Per-block execution context handed to kernel functions. It exposes thread_idx, block_idx, block_dim and grid_dim, shared memory, barriers, warp intrinsics, atomics, and math and fp conversion intrinsics.
- `CUDARuntime.__init__` [complete/high]: Store the launch indices and dimensions, lazily create shared memory if a size was given, and create a WarpState.
- `CUDARuntime.shared` [complete/high]: Get the block's shared memory of at least n_floats, allocating or growing it on demand (the equivalent of declaring __shared__ float[n]).
- `CUDARuntime.syncthreads` [stub/high]: Stand-in for __syncthreads(). It is a deliberate no-op because the block is executed sequentially and vectorised.
- `CUDARuntime.shfl_down_sync` [complete/high]: Delegate the warp shuffle-down step to the WarpState.
- `CUDARuntime.warp_reduce_sum` [complete/high]: Delegate a full warp sum reduction to the WarpState.
- `CUDARuntime.atomic_add` [complete/high]: Method wrapper over the module-level atomic_add, so kernels can call rt.atomic_add.
- `CUDARuntime.rsqrtf` [complete/medium]: Reciprocal square root, mirroring CUDA's rsqrtf.
- `CUDARuntime.expf` [complete/high]: Single-precision exponential, mirroring CUDA's expf.
- `CUDARuntime.fmaxf` [complete/medium]: Return the maximum of two floats, mirroring CUDA's fmaxf.
- `CUDARuntime.float2half` [complete/high]: Convert an array to float16, mirroring the CUDA float-to-half intrinsic.
- `CUDARuntime.half2float` [complete/high]: Convert an array to float32, mirroring the CUDA half-to-float intrinsic.
- `launch_kernel` [complete/high]: Emulate a CUDA grid launch. It iterates every block (bz, by, bx), builds a fresh CUDARuntime for each, and calls kernel_fn(rt, *args) once per block.

### `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py`

Defines the abstract Backend interface (ABC) that every DigitalGPU compute backend must implement: primitive kernels (tensor creation, gemm, add, relu, softmax, attention, conv2d, mlp, reduce) plus default availability, op-support and info hooks. The runtime dispatches IR ops to these methods, so backends are interchangeable behind the public API.

- `Backend` [complete/high]: Abstract base class and contract for all DigitalGPU backends (digital/SIMT, GPU, cluster, ASIC). It declares the required kernel methods and supplies default capability and info methods.
- `Backend.create_tensor` [stub/high]: Abstract hook that converts raw data into a backend-native tensor of the given dtype.
- `Backend.gemm` [stub/high]: Abstract general matrix multiply, with optional bias and fused activation.
- `Backend.add` [stub/high]: Abstract elementwise tensor addition.
- `Backend.relu` [stub/high]: Abstract elementwise ReLU activation.
- `Backend.softmax` [stub/high]: Abstract softmax along a given axis.
- `Backend.attention` [stub/high]: Abstract scaled dot-product attention, with optional mask and causal masking.
- `Backend.conv2d` [stub/high]: Abstract 2D convolution with optional bias, stride and padding.
- `Backend.mlp` [stub/high]: Abstract fused two-layer MLP: x@w1+b1, activation, then @w2+b2.
- `Backend.reduce` [stub/high]: Abstract reduction (e.g. sum/max/mean) over an axis.
- `Backend.is_available` [complete/high]: Report whether the backend can actually run on the current host. Defaults to True, and backends such as GPU override it.
- `Backend.supports` [complete/medium]: Report whether the backend supports a given op name. The default claims support for everything, and subclasses can narrow this.
- `Backend.info` [complete/high]: Return a small descriptor dict of the backend's name and availability, for diagnostics such as smi output.

### `.task123-publishing-candidate/.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py`

Declares honest plug-points for backends that are part of the architecture but not implemented on this host (cluster, ASIC). Each one reports is_available()=False and raises NotImplementedError carrying a contract describing what a real implementation must do. This keeps the registry, runtime and API backend-agnostic without faking functionality. The module docstring says so, and a NOTE says the 'gpu' backend now lives in device_backend.py.

- `_FutureBackend` [stub/high]: Private base class for not-yet-implemented backends. It implements the Backend kernel interface (create_tensor, gemm, add, relu, softmax, attention, conv2d, mlp, reduce) so that every kernel fails loudly with a contract message. Subclasses override `name` and `contract`.
- `_FutureBackend.is_available` [complete/high]: Report that the backend cannot be used on this host, so the registry's select_backend skips it.
- `_FutureBackend._nyi` [complete/high]: Central helper that raises NotImplementedError naming the backend and operation and appending the backend's contract text.
- `_FutureBackend.create_tensor` [stub/high]: Tensor-creation kernel of the Backend interface. Not implemented here, so it always raises.
- `_FutureBackend.gemm` [stub/high]: Matrix-multiply kernel placeholder that raises NotImplementedError.
- `_FutureBackend.add` [stub/high]: Elementwise add kernel placeholder that raises NotImplementedError.
- `_FutureBackend.relu` [stub/high]: ReLU kernel placeholder that raises NotImplementedError.
- `_FutureBackend.softmax` [stub/high]: Softmax kernel placeholder that raises NotImplementedError.
- `_FutureBackend.attention` [stub/high]: Attention kernel placeholder that raises NotImplementedError.
- `_FutureBackend.conv2d` [stub/high]: 2D convolution kernel placeholder that raises NotImplementedError.
- `_FutureBackend.mlp` [stub/high]: Fused MLP kernel placeholder that raises NotImplementedError.
- `_FutureBackend.reduce` [stub/high]: Reduction kernel placeholder that raises NotImplementedError.
- `ClusterBackend` [stub/medium]: Plug-point for a future multi-node backend. Its contract text says it must partition the MaxCoreGraph across nodes over RPC, shard the KV-cache, and all-reduce at BARRIER ops, with each shard running a device backend locally.
- `ASICBackend` [stub/medium]: Plug-point for a future ASIC backend. Its contract text says it must lower MaxCore IR to ASIC microcode driving DMA engines, on-chip KV-cache, and specialized tensor units.

### `.task123-publishing-candidate/AI enhancements/advancedVideoRendererService.ts`

Video rendering orchestrator for Max Booster that treats the MaxCore AI server as the video renderer. It generates hook/body/CTA copy and sentiment, submits a video job (sync or async with polling), and downloads the result into a local cache or a proxy URL. It then uses local FFmpeg to overlay text and an optional voiceover. It also has a 'photorealistic' branch (MaxCore image, then FFmpeg Ken Burns zoom, then text composite) and a scene-based FFmpeg assembly fallback. The header claims 'No local FFmpeg fallback', but the code uses FFmpeg for compositing, scene assembly and Ken Burns.

- `urlStoreSet` [complete/high]: Insert a filename→MaxCore URL mapping into the exported maxcoreVideoUrlStore, evicting the oldest entry (Map insertion order) once 500 entries are reached.
- `maxcoreAuthHeaders` [complete/high]: Build the auth header set for MaxCore requests, sending the same AI_SERVER_KEY under X-Admin-Key, X-API-Key and Bearer Authorization.
- `looksLikeRealVideo` [complete/high]: Decide from magic bytes and heuristics whether a downloaded buffer is a real video rather than an SPA HTML page or JSON error.
- `extractJobUuid` [complete/high]: Pull a UUID out of a filename such as video_<uuid>.mp4.
- `candidateUrls` [complete/high]: Produce an ordered list of possible MaxCore download URLs for a rendered video. It tries job-UUID API routes first, then filename-based /api routes, then the raw URL and static paths, because MaxCore's actual file-serving route is unknown or unreliable.
- `cacheVideoLocally` [complete/high]: Download a MaxCore-rendered video into uploads/videos by trying candidate URLs and validating the bytes. On failure it falls back to a server-proxy URL.
- `compositeTextOnLocalVideo` [complete/high]: Overlay hook, body and CTA text onto a local video with FFmpeg drawtext. It optionally adds a voiceover, trying MaxCore /generate/audio first and local TTS second. It writes comp_<name>.mp4 and returns its served URL.
- `compositeTextOnLocalVideo.sanitize` [complete/high]: Local closure that strips characters that break FFmpeg drawtext parsing (' " : \ , [ ] %) and normalizes whitespace.
- `compositeTextOnMaxcoreVideo` [complete/high]: Thin wrapper that composites text onto a cached MaxCore video when it has a local /uploads/videos/ URL, and otherwise returns the input URL unchanged.
- `assembleVideoFromScenes` [complete/high]: Fallback that builds a playable MP4 locally from MaxCore scene data. It renders each scene as a coloured background with text, then concatenates the clips with FFmpeg.
- `pollVideoJob` [complete/high]: Poll a MaxCore video job every 2s, up to 150 times, until it is done, errored or timed out. On done it caches the video, falling back to local scene assembly if only the proxy URL is available.
- `fetchPhotorealisticImage` [complete/high]: Request a photorealistic background image from MaxCore /generate/image, built from hook, topic and genre. It downloads it to photo_cache, falling back to a generated gradient if MaxCore fails.
- `generatePhotoGradientFallback` [complete/medium]: Render a three-stop vertical gradient PNG using a genre palette via sharp as an offline substitute for the AI image. If sharp fails, it writes a 1x1 black PNG.
- `kenBurnsAnimate` [complete/high]: Turn a still image into a slow-zoom MP4 using FFmpeg zoompan, as the base video for text compositing.
- `renderPhotorealisticVideo` [complete/high]: Run the full photorealistic pipeline: image, then Ken Burns, then text and voiceover composite. It returns a VideoGenResult with metadata and capabilities.
- `generateContent` [complete/high]: Ask MaxCore /generate/content for caption, hook, body, CTA and hashtags for the video topic.
- `getSentiment` [complete/high]: Score the sentiment of the hook through MaxCore /analyze/sentiment.
- `renderVideo` [complete/medium]: Public entry point. It generates copy and sentiment, then either runs the photorealistic branch or submits a MaxCore video job. A sync result is cached and composited. An async job is polled, then composited. It returns a normalized VideoGenResult with the intelligence fields.

### `.task123-publishing-candidate/client/src/hooks/useBatchAction.ts`

Client-side React hook layer for running bulk operations (delete, update, export, submit, takedown, schedule, move, download, compare, process) against `/api/batch/{resource}/{action}`. It manages a confirm/execute/cancel/reset/retry state machine, simulated progress, toasts, React Query invalidation and strict validation of the server's batch result. Domain wrappers for distribution, social, marketplace, files and analytics preconfigure resource, action, messages and query keys.

- `parseBatchResultResponse` [complete/high]: Read the JSON body of a batch API response and validate it strictly against the ids that were requested. It throws on any inconsistency and otherwise returns a typed BatchResult.
- `useBatchAction` [partial/high]: Core hook that runs one batch operation against the generic batch endpoint. It tracks status (idle, confirming, processing, completed, partial, failed, cancelled), progress, result and error. It shows toasts, invalidates React Query keys on completion, and offers confirm, cancel, reset and retryFailed controls.
- `useDistributionBatchActions` [complete/high]: Wrap useBatchAction with convenience methods for batch operations on distribution releases: submit, takedown, update and delete. Each invalidates /api/distribution/releases.
- `useSocialBatchActions` [complete/high]: Wrap useBatchAction with batch helpers for social posts: schedule (with scheduledTime), delete and update. It invalidates the social posts and calendar queries.
- `useMarketplaceBatchActions` [complete/high]: Wrap useBatchAction with batch helpers for marketplace beat listings: update, delete, set price and set license type.
- `useFileBatchActions` [complete/high]: Wrap useBatchAction with batch helpers for user files: delete, move to folder, download and update.
- `useAnalyticsBatchActions` [complete/high]: Wrap useBatchAction with batch helpers for analytics: export (format, optional dateRange) and compare.

### `.task123-publishing-candidate/client/src/hooks/useBatchActions.ts`

React hooks and helpers for running bulk operations (delete, update, export, submit, schedule, etc.) against `/api/batch/{resource}/{action}` endpoints. The core hook `useBatchActions` manages a status state machine, progress (simulated or polled from a server job), results, toasts, query invalidation, and cancel/reset/retry. Strict response parsers validate the server payloads. Thin domain wrappers (releases, tracks, posts, beats, analytics) preconfigure resource, action, messages and cache keys. The file ends by re-exporting other hooks from `./useBatchAction`.

- `parseBatchActionsResponse` [complete/high]: Parse and strictly validate the JSON body of a batch-action HTTP response into a BatchResult. It rejects any payload that is inconsistent with the IDs that were requested.
- `parseBatchJobProgressResponse` [complete/high]: Parse and validate the JSON body of a batch job progress poll into a BatchJobProgressResponse. It guards against malformed or mismatched progress data.
- `useBatchActions` [partial/high]: Core hook for executing a bulk action. It tracks status (idle, confirming, processing, completed, failed, partial, cancelled), progress, result and error. It calls the batch API, shows toasts, invalidates React Query caches, and exposes confirm, cancel, reset and retryFailed. Progress is either simulated with a timer or polled from a server job.
- `useReleaseBatchActions` [complete/high]: Domain wrapper over useBatchActions for distribution releases. It provides submitReleases, deleteReleases and updateReleases, all of which invalidate '/api/distribution/releases'.
- `useTrackBatchActions` [complete/high]: Domain wrapper for studio tracks, offering moveTracks, tagTracks, exportTracks and deleteTracks.
- `usePostBatchActions` [complete/high]: Domain wrapper for social posts, offering schedulePosts, deletePosts and approvePosts.
- `useBeatBatchActions` [complete/high]: Domain wrapper for marketplace beats, offering updatePrices, updateLicenses and deleteBeats.
- `useAnalyticsBatchActions` [complete/medium]: Domain wrapper for analytics, offering exportAnalytics (csv by default, with an optional date range) and compareAnalytics.

### `.task123-publishing-candidate/client/src/hooks/useBulkAction.ts`

React hook library for running bulk operations (delete, update, export, status change, submit, withdraw, schedule, process) against /api/batch/{resource}/* endpoints. It manages a confirm/execute/cancel/reset state machine, progress, toasts, query invalidation, and strictly validates the server's per-item result payload.

- `parseBulkActionResponse` [complete/high]: Parse and strictly validate a batch endpoint's JSON response against the IDs that were requested, so inconsistent or tampered server results are rejected rather than trusted.
- `useBulkAction` [partial/high]: Core hook that drives a bulk action lifecycle: confirm (pending config), execute (map action to endpoint/method/body, call API, validate result, set status, toast, invalidate queries, fire callbacks), cancel, and reset.
- `useBulkDelete` [complete/high]: Convenience wrapper around useBulkAction for bulk deleting items of a resource, adding a deleteItems(ids) helper with preset messages and query invalidation.
- `useBulkUpdate` [complete/high]: Convenience wrapper for bulk-updating fields on many items of a resource.
- `useBulkExport` [complete/medium]: Convenience wrapper for bulk exporting selected items in a given format (default csv).
- `useBulkStatusChange` [complete/high]: Convenience wrapper for changing the status of many items at once.

### `.task123-publishing-candidate/client/src/hooks/useModuleShortcuts.ts`

Provides a React hook that registers a list of module-scoped keyboard shortcuts with a shared ShortcutContext (registering on mount, unregistering on cleanup), plus default shortcut tables and thin per-module wrappers (studio, analytics, social, distribution, marketplace) that let callers override the no-op default handlers by shortcut id.

- `useModuleShortcuts` [complete/medium]: Register a module's shortcut definitions with the global shortcut registry, activate the module's shortcut context, and return the shortcuts registered for that context. Cleans up registrations on unmount or dependency change.
- `useStudioShortcuts` [partial/medium]: Convenience hook that registers the studio shortcut set (transport, track, editing, view, file), substituting caller-supplied handlers by shortcut id.
- `useAnalyticsShortcuts` [partial/medium]: Convenience hook that registers analytics shortcuts (refresh, export, date range, compare, filter, fullscreen) with caller-overridable handlers.
- `useSocialShortcuts` [partial/medium]: Convenience hook that registers social-media module shortcuts (schedule, preview, new post, calendar, drafts, analytics, inbox) with overridable handlers.
- `useDistributionShortcuts` [partial/medium]: Convenience hook that registers music-distribution shortcuts (new release, submit, upload, metadata, status, schedule) with overridable handlers.
- `useMarketplaceShortcuts` [partial/medium]: Convenience hook that registers marketplace shortcuts (search, filter, play preview, add to cart, favorite) with overridable handlers.

### `.task123-publishing-candidate/client/src/lib/a11y/focus.ts`

Accessibility focus-management helpers for the React client. It provides: saving and restoring focus and scroll position (including a stack-based singleton manager for modal-like flows); moving focus to the first, last, indexed, next or previous focusable element in a container; styling a visible focus indicator; editing tabindex values; testing whether an element is focusable; moving focus within a container; and a focus scope that makes everything outside a container unreachable by Tab (a focus-trap-like lock/unlock). It depends on getFocusableElements from '@/lib/accessibility'.

- `FocusRestoreState` [complete/high]: Interface describing a snapshot of focus: the active element and the window scroll offsets.
- `saveFocusState` [complete/high]: Capture the currently focused element and the current window scroll position so they can be restored later, e.g. when opening and closing a dialog.
- `restoreFocusState` [complete/high]: Return focus to the saved element if it is still in the DOM, then restore the saved scroll position.
- `FocusManager` [complete/high]: Singleton holding a LIFO stack of focus snapshots, so nested overlays can each save focus on open and restore it on close.
- `FocusManager.getInstance` [complete/high]: Lazily create and return the singleton.
- `FocusManager.push` [complete/high]: Save the current focus state onto the stack.
- `FocusManager.pop` [complete/high]: Pop the most recent state and restore it on the next animation frame. The frame delay lets a closing overlay unmount first.
- `FocusManager.clear` [complete/high]: Discard all saved states.
- `FocusManager.depth` [complete/high]: Report the number of saved states.
- `focusFirstElement` [complete/high]: Focus the first focusable descendant of a container. If there is none, make the container itself programmatically focusable (tabindex=-1) and focus it.
- `focusLastElement` [complete/high]: Focus the last focusable descendant of a container.
- `focusByIndex` [complete/high]: Focus the Nth focusable descendant of a container.
- `getNextFocusable` [complete/high]: Return the focusable element after currentElement, wrapping to the first. Used for arrow-key or roving navigation and focus trapping.
- `getPreviousFocusable` [complete/high]: Return the focusable element before currentElement, wrapping to the last.
- `FocusIndicatorOptions` [complete/high]: Options type for focus ring styling: offset, color, width, style and borderRadius.
- `createFocusIndicatorStyles` [complete/high]: Build a CSS declaration string (outline, outline-offset, border-radius) for a focus ring. The string can be injected into CSS-in-JS or a style block. The inventory's 'empty' stub flag is wrong; the function has a full body.
- `applyFocusIndicator` [complete/high]: Attach focus and blur listeners that apply and revert an inline focus ring on an element. Returns a cleanup function that removes the listeners and restores the original inline styles. The inventory's 'empty' stub flag is wrong.
- `applyFocusIndicator.handleFocus` [complete/high]: Focus-event handler that applies the inline outline styles.
- `applyFocusIndicator.handleBlur` [complete/high]: Blur-event handler that restores the original inline styles.
- `setTabOrder` [complete/high]: Assign sequential positive tabindex values to elements, starting at startIndex.
- `removeFromTabOrder` [complete/high]: Take an element out of the Tab sequence while keeping it programmatically focusable (tabindex=-1).
- `addToTabOrder` [complete/high]: Put an element into the Tab order at the given tabindex (default 0).
- `isElementFocusable` [partial/medium]: Heuristically decide whether an element can receive keyboard focus. It rejects disabled elements, tabindex=-1, and display:none or visibility:hidden. It accepts native interactive tags (a requires href) and otherwise requires a tabindex attribute.
- `moveFocusWithinContainer` [complete/high]: Move focus to the next or previous focusable element inside a container, with wraparound. If focus is currently outside the container, focus its first element.
- `createFocusScope` [complete/medium]: Create lock and unlock controls that confine keyboard focus to a container, as for a modal. Lock disables tabbing to all focusable elements outside the container; unlock restores them.
- `createFocusScope.lock` [partial/medium]: Set tabindex=-1 and data-focus-scope-disabled on every focusable element outside the container, recording each original tabindex.
- `createFocusScope.unlock` [complete/high]: Restore the original tabindex of each element that lock disabled (or remove the attribute if there was none), clear the marker attribute, and empty the list.

### `.task123-publishing-candidate/client/src/lib/a11y/keyboard.ts`

Keyboard accessibility utilities: a modal focus trap, a roving-tabindex controller for composite widgets (lists, toolbars, grids), a document-level Escape handler, simple arrow-key navigation, and a typeahead matcher. Each setup function returns a cleanup/controller.

- `createFocusTrap` [partial/medium]: Create a focus-trap controller that confines Tab navigation to a container, optionally handles Escape and outside clicks, sets initial focus, and restores previous focus on deactivation.
- `createFocusTrap.handleKeyDown` [complete/high]: Document keydown handler: delegates Tab to handleTabKey and, on Escape, prevents default and calls onEscape.
- `createFocusTrap.handleTabKey` [complete/high]: Wrap Tab and Shift+Tab focus at the first and last focusable elements within the container.
- `createFocusTrap.handleClick` [complete/high]: Block clicks outside the container while the trap is active and pull focus back inside.
- `createFocusTrap.focusFirstElement` [complete/high]: Move focus to the initialFocus target, else the first focusable element, else the container itself (made programmatically focusable).
- `createFocusTrap.activate` [complete/high]: Start trapping: remember the currently focused element, register listeners, and focus into the container on the next animation frame.
- `createFocusTrap.deactivate` [complete/high]: Stop trapping, remove listeners, and optionally restore focus to the previously focused element.
- `createFocusTrap.pause` [complete/high]: Temporarily suspend trap handling without removing listeners.
- `createFocusTrap.unpause` [complete/high]: Resume trap handling after a pause.
- `createRovingTabIndex` [partial/medium]: Implement the roving tabindex pattern. Exactly one matching item has tabindex=0, and arrow, Home and End keys move focus among items, with optional looping and grid support.
- `createRovingTabIndex.updateTabIndex` [complete/high]: Set tabindex=0 on the focused item and -1 on all others.
- `createRovingTabIndex.handleKeyDown` [complete/high]: Compute the next index from the arrow, Home or End key for the configured orientation, apply loop or clamp, then move focus and notify.
- `createEscapeHandler` [complete/high]: Register a document-level Escape key listener that invokes a callback.
- `createEscapeHandler.handleKeyDown` [complete/high]: On Escape, optionally stop propagation, prevent default, and call onEscape.
- `setupArrowNavigation` [complete/high]: Lightweight arrow-key navigation among elements matching a selector inside a container, with Home/End and optional looping. It does not manage tabindex.
- `setupArrowNavigation.handleKeyDown` [complete/high]: Compute the next focus target from the key and orientation, then focus it and notify.
- `handleTypeahead` [complete/medium]: Create a typeahead matcher. Each typed character is appended to a buffer that resets after a timeout, and the first item whose label starts with the buffer is returned.

### `.task123-publishing-candidate/client/src/lib/video/TemplateCompiler.ts`

Compiles high-level promo template options (release, tour, bts, quote, countdown, split, teaser) into a renderer-ready VideoProject. It dispatches to the per-template compilers in ./templates/PromoTemplates, converts the template layers into VideoRendererEngine layer configs, flattens animations into sorted keyframes, derives audio-reactive bindings and metadata, and estimates render time. It also provides helpers to build default options, rescale a project to another aspect ratio, and append visualizer or particle layers. The file has `@ts-nocheck`, so none of the typing is enforced by the compiler.

- `generateId` [complete/high]: Produce a reasonably unique string ID with a prefix, from timestamp plus random base36 text.
- `getDefaultTransform` [complete/high]: Return a fresh shallow copy of the shared DEFAULT_TRANSFORM so callers can modify it without mutating the constant.
- `compileTemplate` [complete/high]: Public entry point. Compiles PromoTemplateOptions into a CompilationResult in two steps: dispatch to the template-specific compiler, then convert the result to the renderer format.
- `compileTemplateToCompiledTemplate` [complete/high]: Switch on options.type and call the matching compileXxx function from PromoTemplates.
- `convertCompiledTemplateToResult` [complete/high]: Turn a CompiledTemplate into a CompilationResult by building layers, keyframes, audio bindings, the VideoProject and the metadata.
- `convertTemplateLayers` [complete/high]: Map every template layer to a LayerConfig.
- `convertTemplateLayer` [complete/medium]: Convert one TemplateLayer into a LayerConfig, copying id, zIndex, opacity and transform, mapping the type, converting the config, and attaching the first animation if any.
- `mapLayerType` [complete/high]: Map template layer types onto renderer layer types; video becomes image, unknown types fall back to background.
- `convertLayerConfig` [complete/high]: Dispatch a template layer's loose config to the type-specific converter.
- `convertBackgroundConfig` [complete/high]: Map template background fields to the renderer BackgroundConfig, renaming gradientColors to colors and gradientAngle to angle.
- `convertTextConfig` [complete/high]: Build a TextConfig with defaults: font Inter, size 24, white, centered, middle baseline.
- `convertImageConfig` [complete/high]: Build an ImageConfig; src falls back to imageUrl, then to an empty string, and fit defaults to 'contain'.
- `convertShapeConfig` [complete/high]: Build a ShapeConfig, mapping template shapeType to the renderer's type; default is rectangle.
- `convertParticleConfig` [complete/high]: Build a ParticleConfig with defaults (100 particles, white, size 2-8, speed 1-3, lifetime 3, circle), with the emission area defaulting to the full canvas.
- `convertVisualizerConfig` [complete/high]: Map template visualizer settings to the renderer VisualizerConfig; visualizerType is renamed to type, default 'spectrum', color default '#00ff88'.
- `extractKeyframes` [complete/high]: Flatten each layer animation into a start keyframe (from value at startTime) and an end keyframe (to value at endTime), then sort all keyframes by time.
- `extractAudioReactiveBindings` [complete/high]: Collect audio-reactive bindings from layer-level settings (bass range, smoothing 0.8) and from global options.audioReactive targets, skipping targets whose layerId and property are already bound.
- `estimateRenderTime` [complete/medium]: Heuristically estimate render time in seconds: duration*fps frames at 16 ms each, scaled by (1 + 0.1 per layer).
- `createVideoProjectFromTemplate` [complete/high]: Convenience API: fill in defaults for partial options, compile the template, and return only the VideoProject.
- `buildFullOptions` [complete/high]: Fill defaults into partial options: a default palette, a gradient background, and id, name, 16:9, 10s, 30fps. Then add the type-specific required fields with placeholder defaults.
- `scaleProjectToAspectRatio` [complete/medium]: Rescale a project to the target aspect ratio's dimensions: positions use per-axis scale, scale factors use the uniform min scale, layer configs are scaled, and x/y/scaleX/scaleY keyframes are adjusted.
- `scaleLayerConfig` [partial/medium]: Scale pixel-based config fields (fontSize, width, height, radius, barWidth, lineWidth) by the appropriate axis or min scale.
- `addVisualizerToProject` [complete/high]: Return a new project with an audio visualizer layer appended, using default spectrum styling merged with user overrides and centered by default.
- `addParticlesToProject` [complete/high]: Return a new project with a particle layer appended, using default particle settings merged with overrides and an emission area covering the full canvas.

### `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/director/analytics.py`

Implements the analytics feedback loop for the AI director. It defines a PerformanceRecord dataclass for observed engagement, a pluggable AnalyticsSource protocol, file (JSONL) and PDIM-backed implementations with file fallback, and a FeedbackLoop that records performance metrics and derives per-platform hints (top and bottom engagement rates, best modality) for future generation.

- `PerformanceRecord` [complete/high]: Dataclass holding the observed performance of one deployed piece of content (content id, platform, modality, impressions, engagements, completion rate, CTR, timestamp).
- `PerformanceRecord.engagement_rate` [complete/high]: Computed property giving engagements divided by impressions, guarding against division by zero by using max(1, impressions).
- `PerformanceRecord.to_dict` [complete/high]: Serialize the record to a plain dict for JSON persistence.
- `PerformanceRecord.from_dict` [complete/high]: Build a record from a dict, ignoring unknown keys so older or newer stored data does not break loading.
- `AnalyticsSource` [complete/high]: Structural Protocol describing a pluggable analytics backend with get_recent and record.
- `AnalyticsSource.get_recent` [stub/high]: Protocol method: return recent performance records, optionally filtered by platform and modality, up to a limit.
- `AnalyticsSource.record` [stub/high]: Protocol method: persist a performance record and report success.
- `FileAnalyticsSource` [complete/high]: JSONL file-backed analytics store that works locally and survives restarts.
- `FileAnalyticsSource.__init__` [complete/high]: Store the JSONL path, defaulting to the module-level analytics file.
- `FileAnalyticsSource.get_recent` [complete/high]: Read the JSONL file, filter by platform and modality, sort newest first, and return up to limit records. It tolerates a missing file and malformed lines.
- `FileAnalyticsSource.record` [complete/high]: Append a record as one JSON line, stamping recorded_at if unset.
- `PdimAnalyticsSource` [complete/high]: Production analytics source that stores records in PDIM storage under a single key, with a file source as fallback and mirror.
- `PdimAnalyticsSource.__init__` [complete/high]: Create the fallback FileAnalyticsSource.
- `PdimAnalyticsSource._pdim` [complete/high]: Lazily import and return the PDIM storage client, or None if it is unavailable.
- `PdimAnalyticsSource.get_recent` [complete/high]: Read records from the PDIM key director:analytics and filter and sort them. On any failure or empty data it falls back to the file source.
- `PdimAnalyticsSource.record` [complete/high]: Write the record to the file first, then append it to the PDIM list (capped at 1000). Returns success if either write worked.
- `FeedbackLoop` [complete/high]: Facade that records content performance and turns recent records into hints for generation.
- `FeedbackLoop.__init__` [complete/high]: Set the analytics source, defaulting to PdimAnalyticsSource.
- `FeedbackLoop.get_hints` [complete/high]: Compute performance-informed hints for a platform from up to 20 recent records: mean engagement rate of the top 5, sample size, most common modality among the top performers, and mean engagement rate of the bottom 5 when there are at least 10 records.
- `FeedbackLoop.record_feedback` [complete/high]: Convert a raw metrics dict into a PerformanceRecord and persist it through the source.

### `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py`

A pure-Python/NumPy emulation layer for CUDA's execution model on the project's 'digital GPU'. It provides Dim3, a per-block shared-memory scratchpad, warp shuffle/reduction helpers, atomics, CUDA-style math and fp16 intrinsics, a per-block CUDARuntime context, and launch_kernel, which loops over the grid and calls a Python kernel function once per block. It is explicitly not a CUDA interpreter. It is the substrate that SM102 kernels, and the CUDAModule wrapper in nvcc.py, are written against.

- `Dim3` [complete/high]: Mirror CUDA's dim3: an (x, y, z) triple for thread, block and grid dimensions, with each component defaulting to 1.
- `Dim3.__init__` [complete/high]: Store x, y, z, defaulting each to 1.
- `Dim3.from_arg` [complete/high]: Coerce a launch argument (Dim3, int, or tuple/list of up to 3 ints) into a Dim3, like CUDA's <<<grid, block>>> arguments.
- `Dim3.__repr__` [complete/high]: Readable string form such as 'Dim3(x, y, z)'.
- `Dim3.volume` [complete/high]: Total element count, x*y*z (threads per block or blocks per grid).
- `SharedMemory` [complete/medium]: Model a block's __shared__ memory as a fixed-size float32 NumPy buffer.
- `SharedMemory.__init__` [complete/high]: Allocate a zero-filled float32 buffer of n_floats elements.
- `SharedMemory.view` [complete/high]: Return a writable NumPy slice view [start:stop] into the buffer so kernels can work on named regions.
- `SharedMemory.__getitem__` [complete/high]: Index or slice read access to the buffer.
- `SharedMemory.__setitem__` [complete/high]: Index or slice write access to the buffer.
- `SharedMemory.reset` [complete/high]: Zero the whole buffer.
- `SharedMemory.nbytes` [complete/high]: Report the buffer size in bytes.
- `WarpState` [partial/medium]: Model one 32-lane warp holding per-lane float32 values and providing warp-level shuffle and reduction primitives.
- `WarpState.__init__` [complete/high]: Create a 32-lane zero buffer, optionally preloading up to 32 lane values.
- `WarpState.load` [complete/high]: Overwrite the first min(len, 32) lane values.
- `WarpState.shfl_down_sync` [partial/medium]: Emulate one butterfly step of a down-shuffle reduction over 32 lanes. Each lane whose source lane (lane+offset) is in range gets val[lane] + val[lane+offset]. Other lanes keep their own value.
- `WarpState.reduce_sum` [complete/high]: Full 32-lane horizontal sum using a log2(32) loop of down-shuffle-add steps (offsets 16, 8, 4, 2, 1).
- `_AtomicFloat` [dead/medium]: Thread-safe float32 scalar accumulator modelling atomicAdd on a scalar.
- `_AtomicFloat.__init__` [complete/high]: Initialise the float32 value and the lock.
- `_AtomicFloat.add` [complete/high]: Atomically add delta, as float32, to the value.
- `_AtomicFloat.value` [complete/high]: Read the current value as a Python float.
- `_AtomicFloat.reset` [complete/high]: Set the value to 0 under the lock.
- `atomic_add` [complete/high]: Emulate CUDA atomicAdd on an array element. Because execution is single-threaded, a plain in-place += suffices.
- `CUDARuntime` [complete/high]: Per-block execution context passed to kernel functions. It exposes thread/block/grid indices, shared memory, sync, warp intrinsics, atomics, and math and fp-conversion intrinsics.
- `CUDARuntime.__init__` [complete/high]: Store the launch indices and dimensions, lazily create shared memory if shared_n_floats is non-zero, and create a WarpState.
- `CUDARuntime.shared` [complete/high]: Obtain the block's shared memory, allocating or growing it on demand, as an emulation of a __shared__ declaration.
- `CUDARuntime.syncthreads` [complete/high]: Emulate __syncthreads(). It is an intentional no-op because each block runs sequentially and vectorised.
- `CUDARuntime.shfl_down_sync` [complete/high]: Delegate to WarpState.shfl_down_sync, exposing the warp intrinsic on the runtime context.
- `CUDARuntime.warp_reduce_sum` [complete/high]: Convenience warp-wide sum via WarpState.reduce_sum.
- `CUDARuntime.atomic_add` [complete/high]: Method wrapper over the module-level atomic_add, so kernels can call rt.atomic_add.
- `CUDARuntime.rsqrtf` [complete/medium]: Reciprocal square root, mirroring CUDA's rsqrtf.
- `CUDARuntime.expf` [complete/high]: Mirror CUDA's expf, computing the exponential in float32.
- `CUDARuntime.fmaxf` [complete/high]: Return the larger of two scalars, as CUDA's fmaxf.
- `CUDARuntime.float2half` [complete/high]: Convert an array to float16, mirroring CUDA's fp conversion intrinsics.
- `CUDARuntime.half2float` [complete/high]: Convert an array to float32.
- `launch_kernel` [complete/high]: Drive a Python kernel function across a CUDA-style grid. It creates one CUDARuntime per block (z, y, x loop order) and calls kernel_fn(rt, *args). Threads within a block are not iterated: thread_idx is fixed at (0,0,0) because kernels are vectorised across threads.

### `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py`

Defines the abstract Backend interface (contract) that every DigitalGPU compute backend must implement: primitive kernels (tensor creation, gemm, add, relu, softmax, attention, conv2d, mlp, reduce) plus availability/capability/info hooks. The runtime dispatches IR ops to these methods so backends are interchangeable.

- `Backend` [complete/high]: Abstract base class declaring the kernel contract all DigitalGPU backends (digital, GPU, cluster, ASIC) must satisfy; provides default availability, support and info behavior.
- `Backend.create_tensor` [stub/high]: Abstract: convert raw data into a backend-native tensor of the given dtype.
- `Backend.gemm` [stub/high]: Abstract: general matrix multiply a@b with optional bias add and fused activation.
- `Backend.add` [stub/high]: Abstract: elementwise addition of two tensors.
- `Backend.relu` [stub/high]: Abstract: elementwise ReLU activation.
- `Backend.softmax` [stub/high]: Abstract: softmax along a given axis.
- `Backend.attention` [stub/high]: Abstract: scaled dot-product attention over q, k, v with optional mask and causal masking.
- `Backend.conv2d` [stub/high]: Abstract: 2D convolution with optional bias, stride and padding.
- `Backend.mlp` [stub/medium]: Abstract: fused two-layer MLP: activation(x@w1+b1)@w2+b2.
- `Backend.reduce` [stub/high]: Abstract: reduction (e.g. sum/max/mean) over an axis.
- `Backend.is_available` [complete/high]: Report whether the backend can run on this host; default is always True, overridden by device-dependent backends.
- `Backend.supports` [complete/medium]: Report whether the backend supports a named op; default permissive (True for all).
- `Backend.info` [complete/high]: Return a small descriptive dict (backend name and availability) for diagnostics such as smi output.

### `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py`

Declares honest, non-functional backend plug-points (Cluster and ASIC) for the MaxCore backend registry. Each reports unavailable and raises NotImplementedError carrying the contract a real implementation must satisfy, so the runtime and API stay backend-agnostic without faking functionality.

- `_FutureBackend` [stub/high]: Abstract base for not-yet-implemented backends. It is unavailable and every kernel op raises NotImplementedError that includes the subclass-specific contract text.
- `_FutureBackend.is_available` [complete/high]: Report that the backend cannot be used on this host, so selection logic (e.g. select_backend) skips it.
- `_FutureBackend._nyi` [complete/high]: Central helper that raises NotImplementedError naming the backend, the op, and the contract.
- `_FutureBackend.create_tensor` [stub/high]: Placeholder for tensor creation on the future device. It raises NotImplementedError.
- `_FutureBackend.gemm` [stub/high]: Placeholder for matrix multiply; it raises NotImplementedError.
- `_FutureBackend.add` [stub/high]: Placeholder for elementwise add; it raises NotImplementedError.
- `_FutureBackend.relu` [stub/high]: Placeholder for the ReLU activation; it raises NotImplementedError.
- `_FutureBackend.softmax` [stub/high]: Placeholder for softmax; it raises NotImplementedError.
- `_FutureBackend.attention` [stub/high]: Placeholder for the attention op; it raises NotImplementedError.
- `_FutureBackend.conv2d` [stub/high]: Placeholder for 2D convolution; it raises NotImplementedError.
- `_FutureBackend.mlp` [stub/high]: Placeholder for the fused MLP op; it raises NotImplementedError.
- `_FutureBackend.reduce` [stub/high]: Placeholder for reduction ops; it raises NotImplementedError.
- `ClusterBackend` [stub/medium]: Declared plug-point for a multi-node cluster backend. Its contract is to partition the MaxCoreGraph across nodes over RPC, shard the KV-cache, and all-reduce at BARRIER ops.
- `ASICBackend` [stub/medium]: Declared plug-point for an ASIC backend. Its contract is to lower MaxCore IR to ASIC microcode driving DMA engines, on-chip KV-cache, and tensor units.

### `.task123-publishing-candidate/reports/aso/isolated-full-20261106T233139Z/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py`

(analysis failed: ValueError)


### `.task123-publishing-candidate/reports/test-verification/final-map-refresh/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py`

(analysis failed: ValueError)


### `.task123-publishing-candidate/reports/test-verification/final-plan-fix/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py`

(analysis failed: ValueError)


### `.task123-publishing-candidate/reports/test-verification/full-current/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py`

(analysis failed: ValueError)


### `.task123-publishing-candidate/script/deployment/executive.mjs`

Deployment 'executive': a dependency-aware, resource-aware task scheduler for the build and start phases of a Replit VM deployment. It validates a task plan (DAG), adds mandatory build-phase ordering edges, and admits tasks against live CPU, memory and I/O capacity. Each task runs as a detached child process whose descendants are tracked. The executive enforces deadlines and retries, supervises readiness of the application task, and tears down process groups on failure or shutdown signals. It emits a checkpoint JSON on failure. The CLI entrypoint (`main`) wires plans, a per-run state dir, signal binding and an /api/ready probe. A large block comment holds quarantined, malformed duplicate copies of the executor and `main`.

- `now` [complete/high]: Monotonic millisecond clock used for all deadline, backoff and elapsed-time math in the scheduler.
- `signalGroup` [complete/high]: Send a signal to an entire process group (negative pid), ignoring groups that are already gone.
- `liveGroup` [complete/high]: List live (non-zombie, non-dead) processes whose process-group id equals the given pid, by scanning /proc.
- `bounded` [complete/high]: Run an operation with a timeout, rejecting with code DEPLOY_OPERATION_TIMEOUT if it doesn't settle in time.
- `stopJob` [complete/high]: Reliably stop a task's whole process tree: first the owned-process tracker (graceful, with descendants), then SIGTERM then SIGKILL to the process group. Throws if anything remains alive.
- `bindShutdownSignals` [complete/high]: Translate SIGINT/SIGTERM/SIGHUP on the process into an abort of an AbortController with a tagged error (DEPLOY_EXECUTIVE_SIGNAL), returning an unbind function.
- `bindShutdownSignals.handler` [complete/high]: Per-signal listener that aborts the controller once with a DEPLOY_EXECUTIVE_SIGNAL error naming the signal.
- `validatePlan` [complete/high]: Validate a task plan: shape of each task, unique ids, numeric resource fields, retry/timeout/signal option bounds, and acyclic dependencies on known ids.
- `validatePlan.visit` [complete/high]: DFS helper for validatePlan that detects unknown prerequisites and dependency cycles.
- `coordinateBuildPlan` [complete/high]: Return a copy of a build plan with mandatory phase-ordering dependencies injected, so the build phases always run in a fixed order, then re-validate it.
- `runExecutive` [complete/high]: Core scheduler: run the plan's tasks as child processes under dependency, capacity, deadline, retry and readiness rules. Supervise to completion and always drain children.
- `runExecutive.notify` [complete/high]: Wake-up hook for the scheduler's wait loop. Starts as a no-op and is reassigned to the current wait's `finish` function, so child close/error events and aborts interrupt polling.
- `runExecutive.rank` [complete/high]: Compute the memoized critical-path priority of a task (1 + max rank of its successors), so tasks with longer downstream chains are scheduled first.
- `runExecutive.checkpoint` [complete/high]: Build a per-task snapshot (completed, running, failed, retry-backoff, or waiting) for diagnostics attached to a failure.
- `runExecutive.concurrentlyAdmissible` [complete/medium]: Estimate how many of the remaining eligible tasks (from `index` onward) could be admitted concurrently, to divide free CPU fairly among elastic tasks.
- `runExecutive.abort` [complete/high]: Convert an external AbortSignal reason into a normalized `failure` error, preserving DEPLOY_EXECUTIVE_SIGNAL errors, and wake the loop.
- `runExecutive.finish (wait promise closure)` [complete/low]: Ends one scheduler wait: clears the timer, resets notify, and resolves the promise. Shared by timeout and notify.
- `main (active entrypoint, last definition)` [partial/medium]: CLI entrypoint for 'build' or 'start' mode: pick and validate a plan, create a temp state dir, bind shutdown signals, log detected capacity, and run the executive with a budget. Start mode gets a /api/ready readiness probe. On failure print a task-checkpoint JSON, and always clean up.
- `main (commented-out copies at ~L835-949 and ~L1262-1290)` [dead/high]: Quarantined, malformed duplicates of the executor entrypoint/runExecutive tail. The comment explicitly says they are interrupted copies retained only for reference.
- `main.unbind (commented-out)` [dead/medium]: Placeholder `let unbind = () => {}` in a quarantined copy of main, later meant to hold the unbind function from bindShutdownSignals.

### `.task123-publishing-candidate/script/lib/provisionPortablePython.mjs`

Provisions an isolated, version-pinned portable CPython (python-build-standalone, Linux x86_64) into <root>/python_runtime. It reuses an existing runtime if it passes verification. Otherwise it downloads, validates and extracts the archive into a staging dir, installs and verifies locked dependencies, then swaps the staged runtime in with backup and rollback. It also works as a CLI entry point.

- `command` [complete/high]: Synchronous subprocess helper. Runs a command, throws on spawn error or non-zero exit (including the last 2000 chars of stderr), and returns stdout as a string.
- `downloadArchive` [complete/high]: Downloads a URL to a file via curl, with hardening: HTTPS only (including on redirects), TLS 1.2+, retries, and connect/overall timeouts.
- `validateArchive` [complete/high]: Safety-checks the tarball listing before extraction. It must contain python/bin/python3, and every member must be a relative path rooted under 'python/' with no absolute or '..' traversal.
- `runRuntimeCheck` [complete/high]: Verifies a portable runtime is usable. It checks that bin/python3 exists and is an executable file, that its version equals the expected one, and that the dependency installer script passes in --verify-only mode.
- `replaceRuntime` [complete/high]: Swaps the staged runtime into place with rollback. It renames any existing runtime dir to a UUID backup, renames the staged dir into place, restores the backup on failure, and removes the backup on success.
- `provisionPortablePython` [complete/high]: Public entry point. Ensures <root>/python_runtime holds a verified portable Python of the pinned version. It reuses a valid existing runtime. Otherwise it stages, downloads, validates, extracts, installs dependencies, verifies and swaps. It always cleans up the staging dir.

### `.task123-publishing-candidate/scripts/database-recovery-drill.mjs`

Standalone, one-shot disaster-recovery drill for the production Neon Postgres database. It takes a consistent read-only snapshot, dumps it with pg_dump, optionally retains the dump in private managed storage and reads it back, restores it into a disposable local PostgreSQL cluster, then compares schema fingerprints, per-table row counts and content hashes. It writes sanitized Markdown and JSON reports and sets a nonzero exit code unless the drill passes.

- `run` [complete/high]: Run an external command synchronously with a scrubbed environment and a timeout. Return stdout, or throw an error containing a sanitized diagnostic if the exit status is nonzero.
- `tableInventory` [complete/high]: Inventory all user tables and partitioned tables, then compute an exact row count and a deterministic content hash per table. The hash is an md5 of the sorted per-row md5s of to_jsonb. This lets the source snapshot and the restored target be compared.
- `schemaEvidence` [complete/medium]: Collect canonical catalog definitions: relations/views, columns, types, constraints, indexes, functions/procedures, sequences, triggers and RLS policies. Fingerprint each section and the whole set with SHA-256, to prove schema parity between source and restored target.
- `_identity_arguments` [dead/high]: Not a real function. It is a spurious inventory entry pointing at the text 'pg_get_function_identity_arguments' inside the functions SQL query string.
- `def` [dead/high]: Not a real function. It is a spurious inventory entry for the 'def' token that appears in the SQL text (for example 'pg_get_functiondef' / 'definition').
- `mkdirSyncCompat` [complete/high]: Create the private (mode 700) socket directory by shelling out to `mkdir -m 700`, deliberately avoiding any workspace helper imports.
- `sourceIdentityParts` [complete/high]: A constant (an IIFE result, not a function) holding the source URL's hostname, username, password and database name. Each part is at least 3 characters long. It is used to redact source identity from diagnostics.
- `digest` [complete/high]: Return the SHA-256 hex digest of a value.
- `currentRecoverySource` [complete/high]: Establish the identity of the recovery implementation. It hashes the contents of the five recovery-related source files and gets the git HEAD revision. The result is recorded alongside the retained backup for provenance.
- `escapeRegExp` [complete/high]: Escape regex metacharacters in a string so it can be used literally in a RegExp.
- `sanitizeDiagnostic` [complete/high]: Redact sensitive details from error or diagnostic text before it is logged or written to reports. This covers Postgres-sensitive content (via safePostgresDiagnostic), source identity parts, the temp path and the temporary port.
- `quoteIdentifier` [complete/high]: Quote a SQL identifier by wrapping it in double quotes and doubling embedded quotes.
- `qualified` [complete/high]: Build a schema-qualified, quoted table name from a row with schema_name and table_name.
- `recordCheck` [complete/high]: Record a named check result in the report. Throw immediately on failure so the drill aborts as blocked.
- `commandEnv` [complete/high]: Build a minimal, hermetic environment for child processes: PATH, HOME set to the temp dir, LANG=C and TZ=UTC, plus overrides. This prevents leaking credentials to the children.

### `.task123-publishing-candidate/scripts/readiness-assembled-acceptance.mjs`

Sealed, self-contained readiness acceptance drill. It refuses to run if sensitive env vars are inherited, then starts a disposable local Postgres and the app on ephemeral ports. It checks health, readiness and the frontend, then runs an HTTP auth journey (CSRF, register, login, logout, project CRUD with optimistic concurrency). It then runs either a headless-Chromium browser journey or, with --http-load, a bounded authenticated HTTP load test. It writes JSON/Markdown evidence reports under reports/readiness-implementation/ and cleans up. Only the top of the file (setup and helpers through part of runProjectCrud) is visible; the rest is inferred from names and the inventory.

- `reserveEphemeralPort` [complete/high]: Reserve a free TCP port on 127.0.0.1 by binding port 0, reading the assigned port, and closing the server, so the port can be handed to Postgres, the app and PDIM.
- `sanitizedLogTail` [complete/high]: Return a redacted tail of the app log for failure reports, using the in-memory tail or the persisted log, whichever is longer. It masks postgres URLs and authorization/token/secret/password values.
- `run` [complete/high]: Synchronous subprocess helper that runs a command in the repo root with a given env and returns stdout. On non-zero exit it throws an error with a redacted, truncated stderr.
- `request` [complete/high]: Promise-based HTTP client against the app on 127.0.0.1:appPort. It supports an optional JSON body, cookie and CSRF header, sets X-Forwarded-Proto: https, caps captured body at 256 KiB while counting total bytes, and applies a timeout.
- `updateCookieJar` [complete/high]: Apply Set-Cookie headers to a Map-based cookie jar: set the name/value pair, or delete the cookie when the value is empty (expiry or clear).
- `cookieHeader` [complete/high]: Serialize the cookie jar into a Cookie request header string.
- `jsonBody` [complete/high]: Parse a response body as JSON, throwing a descriptive error that includes the content type if parsing fails.
- `authRequest` [complete/high]: Cookie-jar-aware request wrapper. It sends the jar's cookies with a 15s timeout and updates the jar from the response's Set-Cookie headers.
- `runHttpAuthJourney` [complete/high]: Run the end-to-end HTTP auth contract. It bootstraps CSRF and checks that the body token matches the cookie, registers a user, upgrades the user to a pro tier in the disposable DB, and checks session persistence. It then logs out, logs in, runs project CRUD, logs out again and verifies the session is cleared.
- `runProjectCrud` [complete/medium]: Exercise project create, read and update through the API, including optimistic concurrency. A PATCH without a version must return 428, and an update with the correct expectedUpdatedAt must succeed. The excerpt ends at a stale-version PATCH, which presumably expects a conflict, then delete and verification.
- `fetchJsonFromPort` [unclear/low]: Likely fetches and parses JSON from a given local port, e.g. Chromium's DevTools /json endpoints or the app. The body is not visible.
- `runBrowserJourney` [unclear/low]: Drive headless Chromium over the DevTools protocol via WebSocket. It most likely navigates the frontend, performs auth and UI flows, sweeps routes, and collects console and network evidence. It is the largest function (L292-664) and is skipped in --http-load mode.
- `runBrowserJourney.rejectPending` [unclear/low]: Likely rejects all outstanding CDP command promises when the socket closes or errors.
- `runBrowserJourney.command` [unclear/low]: Likely sends a CDP command over the WebSocket and returns a promise resolved by the matching response id.
- `runBrowserJourney.isContextTransition` [unclear/low]: Likely a predicate that detects a CDP execution-context destruction or transition error. It is a one-line helper that lets evaluate retry across navigations.
- `runBrowserJourney.evaluate` [unclear/low]: Likely runs a JavaScript expression in the page via Runtime.evaluate, with retry on context transitions, and returns the value.
- `runBrowserJourney.browserApi` [unclear/low]: Likely performs an API request from within the browser page context, e.g. via fetch, for the authenticated browser session.
- `runBrowserJourney.navigateUntil` [unclear/low]: Likely navigates the browser to a URL and waits until a condition holds, e.g. load or a selector.
- `runBrowserJourney.sweepRoutes` [unclear/low]: Likely visits a set of frontend routes and records whether each renders without errors.
- `waitFor` [unclear/low]: Likely a polling helper that waits for a predicate or condition with a timeout.
- `sha256` [unclear/medium]: Likely returns the SHA-256 hex digest of a value. createHash is imported.
- `memoryAdmissionSnapshot` [unclear/low]: Likely collects a memory or admission-control snapshot (app process RSS and perhaps a health or readiness payload) for the capacity-admission evidence.
- `nearestRank` [unclear/medium]: Likely computes a percentile by the nearest-rank method over a sorted array. It is used for latency statistics in the load test.
- `createLoadSession` [unclear/low]: Likely creates an authenticated session (user plus cookie and CSRF) used by load workers.
- `runAuthenticatedHttpLoad` [unclear/low]: Likely runs the bounded authenticated HTTP load test (the --http-load mode) with concurrent sessions, and records latency percentiles, error rates and memory.
- `retainAppLogTail` [unclear/low]: Likely appends app stdout/stderr chunks to the bounded in-memory appLogTail, feeding sanitizedLogTail.

### `.task123-publishing-candidate/scripts/simulate-production.mjs`

(withheld: contains a possible secret)


### `.task123-publishing-candidate/scripts/test-data-runtime.mjs`

Standalone Node test script that checks data-runtime boundaries with no real Postgres, Redis, BullMQ or S3. It uses esbuild to bundle server modules with mocked dependencies. The areas covered are the authoritative session store and revocation, the retention worker's quarantine of malformed jobs, PDIM RedisStore recovery and legacy conversion, and DatabaseBackupService backup, restore and shutdown. It asserts durability, fail-stop and explicit-error behavior, and prints PASS lines. Most inventory symbols are small mock functions inside template strings or inline helpers, not real exports.

- `bundle` [complete/high]: Bundle a TypeScript entry file with esbuild, replacing any import whose path matches a regex with inline mock JS source, then dynamically import the result. This isolates the module under test from its real dependencies.
- `prepareConversion` [complete/high]: Write the legacy-conversion fixture files (snapshot, AOF, stream export) plus an approval JSON containing their SHA-256 hashes, so convertLegacy can be run against them.
- `selectPgDumpForServer` [complete/high]: Mock of the postgresTools function that picks a pg_dump binary. It always returns a fake PG17 tool and records the selection for later assertions.
- `dumpedServerMajor` [complete/high]: Mock helper that parses the source Postgres major version from the '-- Dumped from database version' header of a dump buffer.
- `dumpedServerVersion` [complete/high]: Mock helper that parses the full source version string (for example '17.11') from the dump header.
- `selectPsqlForRestore` [complete/high]: Mock that picks a psql binary for restore. It requires the dumped major to be 17, returns a fake PG17 psql tool and records the selection.
- `safePostgresDiagnostic` [complete/medium]: Mock of the diagnostic sanitizer. It just stringifies its input with no redaction.
- `spawn` [complete/high]: Mock child_process.spawn that records the call and emulates a process. pg_dump emits a fake SQL dump with a version-17.11 header, other commands emit empty stdout, then it emits 'close' with a configurable exit code.
- `sql` [complete/high]: Mock of drizzle-orm's sql tagged template. It returns the strings and values so tests can inspect the query text.
- `sessionAuthority` [complete/high]: Mock of services/sessionAuthority. It is an async factory returning globalThis.testAuthority, so tests control validate/revoke. It is defined twice, in the authoritativeSessionStore and sessionConfig mocks.
- `readSession` [complete/high]: Test helper that promisifies store.get('sid'). It resolves with the session data, or null if the store rejects it, and rejects on error.
- `getRedisClient` [complete/high]: Mock redisClient.getRedisClient that throws, proving revocation never falls back to a transient Redis path.
- `isPdimConfigured` [complete/high]: Mock pdimClient.isPdimConfigured that reports PDIM as not configured.
- `newBullMQRedisConnection` [stub/high]: Mock BullMQ Redis connection factory that returns an empty object. The Worker mock never uses it.
- `flushFeatureEvents` [stub/high]: Mock featureEventBuffer.flushFeatureEvents as an async no-op. The test calls the 'feature-event-flush' job through the worker processor.
- `encode` [stub/high]: Mock for @msgpack/msgpack's encode. It is a no-op that only lets the RedisStore module import. The test uses JSON-based recovery encoding instead.
- `decode` [stub/high]: Mock for @msgpack/msgpack's decode. It is a no-op placeholder that lets the module import.
- `deferred` [complete/high]: Create a promise with externally accessible resolve and reject, to synchronize the shutdown/drain scenarios (upload entered, upload release, renewal release).
- `tick` [complete/high]: Yield to the event loop for one setImmediate turn, so pending microtasks and callbacks can run.

### `.task123-publishing-candidate/scripts/testing/page80-acceptance.mjs`

Acceptance harness for the Max Booster 'page80' extended isolated test. It refuses to run with inherited sensitive environment variables and reserves ephemeral local ports. It then runs the assembled app against a disposable local Postgres and records evidence and failures into JSON/Markdown reports. Checks include health, readiness, frontend, HTTP auth/CSRF/session/project-CRUD journeys, an authenticated HTTP load mode (`--http-load`), a Chromium browser journey with route sweep, an egress guard and cleanup. Only the header and the first part of the file are visible, so the later functions are inferred from names and the evidence object.

- `reserveEphemeralPort` [complete/high]: Obtain a free TCP port on 127.0.0.1 by binding to port 0, reading the assigned port, then closing the listener, so Postgres, the app and PDIM get non-colliding ports.
- `sanitizedLogTail` [complete/high]: Return a redacted tail of the app's log for inclusion in failure reports, without leaking DB URLs or credentials.
- `run` [complete/high]: Synchronously run a subprocess in the repo root with a controlled env and fail loudly on a nonzero exit, with the error message redacted.
- `request` [complete/high]: Minimal promise-based HTTP client to the locally running app (127.0.0.1:appPort), simulating an HTTPS proxy and optional cookie, CSRF and per-client IP headers.
- `updateCookieJar` [complete/high]: Apply Set-Cookie headers to a Map-based cookie jar, storing name→value and deleting a cookie when its value is empty.
- `cookieHeader` [complete/high]: Serialize a cookie jar Map into a Cookie request header string.
- `jsonBody` [complete/high]: Parse a response body as JSON, throwing a descriptive error that names the content type if parsing fails.
- `authRequest` [complete/high]: Send a request on behalf of a cookie-jar session, attaching the jar's cookies and the per-jar load client IP, then absorbing Set-Cookie into the jar.
- `runHttpAuthJourney` [complete/high]: End-to-end HTTP check of CSRF bootstrap, registration, session persistence, logout, login, project CRUD and final logout for a fresh user, using only HTTP plus a direct DB tweak to grant a paid tier.
- `runProjectCrud` [unclear/medium]: Exercise project create/read/update (and probably delete) as an authenticated owner, including optimistic-concurrency enforcement (428 without expectedUpdatedAt).
- `fetchJsonFromPort` [unclear/low]: Likely fetch and parse JSON from a given local port (probably a health/readiness check against the app or PDIM port). Body not shown.
- `runBrowserJourney` [unclear/low]: Drive the Chromium-based browser acceptance journey (UI auth, navigation, route sweep), populating evidence.browser. It is the large core of the script (starts at L299).
- `browserApi` [unclear/low]: Probably a helper that exposes browser/CDP calls or in-page API requests within the browser journey.
- `navigateUntil` [unclear/low]: Probably navigate the browser to a URL and wait until a condition holds (load or route state).
- `sweepRoutes` [unclear/low]: Probably visit a list of application routes in the browser and check each renders without error or unexpected redirect.
- `waitFor` [unclear/low]: Generic polling/wait helper (probably polls a predicate until it is true or a timeout).
- `sha256` [unclear/medium]: Probably a hex SHA-256 hash helper using the imported createHash.
- `memoryAdmissionSnapshot` [unclear/low]: Likely capture memory/capacity-admission data (process or system memory) around the load test, in support of evidence.capacityAdmission.
- `nearestRank` [unclear/medium]: Likely compute a percentile via the nearest-rank method from a sorted array of load latencies.
- `createLoadSession` [unclear/low]: Likely create an authenticated session (cookie jar with a unique client IP registered in loadClientIps) for a load-test virtual user.
- `runAuthenticatedHttpLoad` [unclear/low]: Run the authenticated HTTP load phase (the --http-load mode), driving concurrent sessions against the app and recording evidence.httpLoad (likely latency percentiles and error rates).
- `rejectPending` [unclear/low]: Probably reject outstanding pending CDP/WebSocket command promises when the browser connection closes or errors.
- `command` [unclear/low]: Probably send a Chrome DevTools Protocol command over the WebSocket and return a promise for its response.
- `isContextTransition` [unclear/low]: Probably a predicate that detects a CDP execution-context change or navigation error.
- `evaluate` [unclear/low]: Probably evaluate a JavaScript expression in the browser page via CDP Runtime.evaluate, retrying across context transitions.
- `retainAppLogTail` [unclear/medium]: Probably update the in-memory appLogTail buffer with the latest app output chunk, bounded in size.

### `.task123-publishing-candidate/server/lib/stripeClient.ts`

Central helper for creating Stripe SDK clients on the server. It resolves environment-appropriate Stripe keys, validates credential shape, lazily constructs and caches a client keyed by the current secret, and optionally routes traffic through an HTTPS proxy. In proxy mode it restricts the destination to api.stripe.com:443 and forces Bearer authorization. It also defines a 503 'not configured' error.

- `getStripeSecretKey` [complete/high]: Return the one Stripe secret key suited to the current runtime (production vs non-production) by delegating to the shared selector.
- `getStripePublishableKey` [complete/high]: Return the publishable Stripe key for the current runtime, which is safe to expose to the browser.
- `hasStripeCredential` [complete/high]: Type guard checking that a value is a plausibly well-formed credential string: non-empty, no leading/trailing whitespace, no CR/LF. It deliberately does not check a key prefix, so proxy-delivered opaque bindings pass.
- `StripeUnavailableError` [complete/high]: Error type signalling that Stripe billing is not configured, carrying HTTP 503 and a stable error code for handlers.
- `lazyStripeClient` [complete/high]: Build a getter that defers Stripe SDK client creation until first use, so importing billing services does not require Stripe configuration. It caches the client and rebuilds it if the secret changes.
- `createStripeClient` [complete/high]: Create a Stripe SDK client. If HTTPS_PROXY is set, it uses a custom HTTP client that routes via the proxy, allows only api.stripe.com:443 over https, and replaces the Authorization header with a Bearer token so opaque credential bindings are preserved.

### `.task123-publishing-candidate/server/services/backup/postgresTools.ts`

Helpers for the backup/restore subsystem to find usable PostgreSQL client binaries (pg_dump, psql) on PATH. They probe each binary's version, ask the target server for its major version, and pick a client at least as new as the server. They also convert a postgres URL into libpq PG* environment variables (so credentials stay off the command line), redact diagnostics, and read the source server version from a dump header. All child processes are bounded by timeout and output size.

- `postgresConnectionEnvironment` [complete/medium]: Convert a postgres:// or postgresql:// URL into libpq environment variables (PGHOST, PGPORT, PGUSER, PGDATABASE, optional PGPASSWORD). Whitelisted query parameters are mapped to their PG* variables. Unknown parameters are rejected.
- `safePostgresDiagnostic` [complete/high]: Turn an error or arbitrary value into a short message that is safe to log or surface, redacting database URLs and password=... fragments and truncating to 500 chars.
- `runBounded` [complete/high]: Spawn a command and collect its stdout and stderr, with a hard timeout and a cap on combined output. Resolves with the exit code and output, rejects on timeout, output overflow or spawn error.
- `runBounded.collect` [complete/high]: Inner chunk handler that appends decoded output to the stdout or stderr buffer and enforces the shared byte limit by killing the child and rejecting on overflow.
- `parsePostgresClientVersion` [partial/medium]: Parse `pg_dump --version` / `psql --version` output (e.g. 'psql (PostgreSQL) 16.2') into a major number and a version string.
- `parseServerMajor` [complete/high]: Convert the output of `SHOW server_version_num` (e.g. 160002) into a major version number, with validation.
- `installedCandidates` [complete/high]: Discover distinct, resolved, executable paths for a named tool by scanning PATH directories.
- `probePostgresTools` [complete/high]: Find all installed candidates of a tool and run `--version` on each to build a list of versioned tools. Failing candidates are dropped.
- `queryServerMajor` [complete/high]: Use a given psql binary to connect to the database and run `SHOW server_version_num`, returning the server major version.
- `serverMajorWithAvailablePsql` [complete/high]: Determine the server major by trying installed psql clients from newest to oldest until one succeeds. Return the major plus the probed psql list.
- `compatibleTool` [complete/high]: Pick the best client for a server: only tools with major >= server major are eligible. An exact major match is preferred, otherwise the lowest newer major.
- `selectPgDumpForServer` [complete/high]: Select a pg_dump binary compatible with the source database's server version. It queries the server major via psql and probes pg_dump candidates in parallel.
- `selectPsqlForRestore` [complete/high]: Select a psql binary for restoring a dump into a target DB. It refuses to restore into a target server older than the dump's source server.
- `dumpedServerMajor` [complete/high]: Return the source PostgreSQL major version recorded in a SQL dump header.
- `dumpedServerVersion` [complete/high]: Extract the '-- Dumped from database version X[.Y]' string from the first 8KB of a pg_dump SQL file.

### `.task123-publishing-candidate/server/services/safeUrlFetch.ts`

Shared SSRF-safe outbound HTTP fetch utility. It classifies reserved/private IPs, validates that a URL is a public http(s) URL, and fetches text or binary bodies with limits on size, time and redirects. A custom DNS lookup on the http/https Agents rejects private or reserved addresses at connect time, which closes the DNS-rebinding window. The header comment says URL-to-content generation, the URL parser and autopilot link enrichment must use it.

- `isReservedIp` [complete/high]: Decide whether an IP literal (or 'localhost') is private, loopback, link-local, CGNAT, documentation, transition, multicast or otherwise reserved, so it must not be fetched. It fails closed on anything it cannot parse.
- `safeDnsLookup` [complete/high]: Replacement for dns.lookup, used as the Agent `lookup` option. It resolves all addresses for a host and refuses the connection if any resolved address is reserved. Checking at connect time defeats DNS rebinding.
- `assertPublicHttpUrl` [complete/high]: Pre-flight validation that a string is a fetchable public http(s) URL. It throws on an invalid URL, a non-http(s) scheme, embedded credentials, localhost/.local/.internal hostnames, or a literal reserved IPv4/IPv6 host.
- `safeFetchText` [complete/high]: Fetch a public URL and return its body decoded as UTF-8 text, with SSRF, redirect, size and time bounds. It returns non-2xx responses to the caller and throws only on network errors, SSRF blocks or invalid URLs.
- `safeFetchBuffer` [complete/high]: Core SSRF-safe fetcher. It validates the URL and the optional allowedHost, then does an axios GET with the SSRF-guarded agents, a timeout, a size cap, at most 3 redirects, no proxy, and a browser-like User-Agent. Each redirect hop is re-validated. It returns the raw body as a Buffer.

### `AI enhancements/advancedVideoRendererService.ts`

Video rendering orchestrator for Max Booster. It treats the MaxCore AI server as the authoritative renderer. It generates hook/body/CTA copy and a sentiment score, then submits a video job, either synchronously or by polling. It downloads the result into uploads/videos, falling back to an authenticated proxy URL. It overlays text and optional voiceover with local FFmpeg. It also has a 'photorealistic' branch: MaxCore image, then FFmpeg Ken Burns zoom, then text composite. The header comment says there is no local FFmpeg fallback, but FFmpeg is used for compositing and scene assembly.

- `urlStoreSet` [complete/high]: Insert filename→MaxCore URL into the exported maxcoreVideoUrlStore, evicting the oldest entry (FIFO by Map insertion order) once 500 entries are reached, so the map stays bounded.
- `maxcoreAuthHeaders` [complete/high]: Build the auth header set for MaxCore requests, sending the same key as X-Admin-Key, X-API-Key and Bearer token.
- `looksLikeRealVideo` [complete/high]: Decide whether a downloaded buffer is a real video and not an SPA HTML page or JSON error. Checks MP4 'ftyp', WebM and RIFF magic bytes. Otherwise it rejects HTML/JSON-looking heads and accepts only buffers over 100 KB.
- `extractJobUuid` [complete/high]: Pull a UUID out of a filename such as video_<uuid>.mp4, to build job-based download routes.
- `candidateUrls` [complete/high]: Produce an ordered list of guessed MaxCore download URLs for a rendered video. Job-UUID API routes come first, then filename-based /api routes, then the raw URL and static paths. This works around an unknown or unreliable file-serving layer.
- `cacheVideoLocally` [complete/high]: Download a MaxCore-rendered video to uploads/videos by trying candidate URLs with auth. Each response is validated by magic bytes. Returns the local served path on success, else a proxy path that streams from MaxCore.
- `CompositeOpts` [complete/high]: Option bag (voiceover, genre, duration, artist, topic) for text/voice compositing.
- `compositeTextOnLocalVideo` [complete/high]: Burn hook/body/CTA text onto a local video with FFmpeg drawtext, optionally adding an AI voiceover. The voiceover comes from MaxCore /generate/audio, with local TTS generateAudio as fallback. Writes comp_<basename> and returns its served URL. Throws on FFmpeg failure so callers can fall back. The inventory's 'stub=empty' flag is a false positive; the body is substantial.
- `compositeTextOnLocalVideo.sanitize` [complete/high]: Inner closure that strips characters which break FFmpeg drawtext parsing and normalizes whitespace. The listed 'callers' in Python build scripts are spurious name collisions.
- `compositeTextOnMaxcoreVideo` [complete/high]: Wrapper that maps a served '/uploads/videos/...' URL to a local path and composites text and voice onto it. On any failure, or if there is no text or the URL is not local, it returns the original URL. The 'stub=empty' flag is a false positive.
- `assembleVideoFromScenes` [complete/high]: Last-resort fallback that builds a playable MP4 locally from MaxCore scene text. Each scene becomes a solid-color lavfi clip with drawtext, and the clips are concatenated. Used when MaxCore finished but its files cannot be downloaded.
- `pollVideoJob` [complete/high]: Poll MaxCore /video-job/<id> every 2s for up to 150 attempts. On 'done' it caches the video locally, falls back to scene assembly if only the proxy is available, and returns a VideoGenResult. Returns null on error or timeout.
- `fetchPhotorealisticImage` [complete/high]: Request a photorealistic background image from MaxCore /generate/image using a prompt built from hook, topic, genre and platform. Downloads it to uploads/photo_cache and falls back to a generated gradient on failure. Exported.
- `generatePhotoGradientFallback` [complete/high]: Render a genre-keyed three-stop vertical gradient PNG with sharp as a stand-in image. If sharp fails, write a 1x1 black PNG.
- `kenBurnsAnimate` [complete/medium]: Turn a still image into an MP4 with a slow centered zoom-in using FFmpeg zoompan, as the base for text compositing.
- `renderPhotorealisticVideo` [complete/high]: Orchestrate the photorealistic path: fetch image, Ken Burns, then composite text and voice. Return a VideoGenResult with metadata and the intelligence fields, or a failure result.
- `generateContent` [complete/high]: Ask MaxCore /generate/content for caption, hook, body, CTA and hashtags from artist, topic, genre, platform, tone and goal.
- `getSentiment` [complete/high]: Score the sentiment of the hook text via MaxCore /analyze/sentiment.
- `renderVideo` [complete/medium]: Main exported entry point. Generates content and sentiment intelligence, then either takes the photorealistic branch or submits a MaxCore /generate-video job. It handles both synchronous (url) and async (job_id, polled) responses, caches the video, composites text/voice, and returns a VideoGenResult enriched with the intelligence fields.

### `client/src/hooks/useBatchAction.ts`

Client-side React hook layer for running bulk ("batch") operations against `/api/batch/{resource}/{action}`. The core `useBatchAction` hook manages the lifecycle (confirm, execute, progress, result, cancel, reset, retry), shows toasts and invalidates React Query caches. A strict response parser validates the server payload. Five domain wrappers (distribution, social, marketplace, files, analytics) preconfigure resource, action, messages and query keys.

- `parseBatchResultResponse` [complete/high]: Read a fetch Response's JSON and validate that it is a well-formed BatchResult consistent with the IDs that were requested, so the UI never trusts a malformed or inconsistent server reply.
- `useBatchAction` [partial/high]: Generic hook that runs a batch action on a list of resource IDs. It exposes status, progress, result and error state plus execute, confirm, cancel, reset and retryFailed. It posts to /api/batch/{resource}/{action}, parses and validates the result, toasts the outcome, and invalidates the listed query keys.
- `useDistributionBatchActions` [complete/medium]: Wrapper around useBatchAction offering release-specific batch operations for the music distribution feature: submit, takedown, update and delete releases.
- `useSocialBatchActions` [complete/medium]: Wrapper around useBatchAction for batch social-post operations: schedule, delete and update posts.
- `useMarketplaceBatchActions` [complete/medium]: Wrapper around useBatchAction for batch beat/listing management in the marketplace: update, delete, change prices and change license types.
- `useFileBatchActions` [complete/medium]: Wrapper around useBatchAction for bulk file management: delete, move to a folder, prepare a download and update metadata.
- `useAnalyticsBatchActions` [complete/medium]: Wrapper around useBatchAction for batch analytics operations: exporting data and generating comparisons across items.

### `client/src/hooks/useBatchActions.ts`

React hook library for bulk operations on resources (releases, tracks, posts, beats, analytics). A generic `useBatchActions` hook drives a state machine (idle/confirming/processing/completed/partial/failed/cancelled). It POSTs or PUTs `{ids, data}` to `/api/batch/{resource}/{action}`, strictly validates the response, tracks real or simulated progress, shows toasts and invalidates React Query caches. Domain wrappers bind it to specific resources. The file also re-exports legacy hooks from `./useBatchAction`.

- `parseBatchActionsResponse` [complete/high]: Parse and strictly validate the JSON body of a batch endpoint response into a `BatchResult`. It checks shape, that counts are consistent with the requested ids, and that every returned id was actually requested. It guards the UI against malformed or mismatched server responses.
- `parseBatchJobProgressResponse` [complete/high]: Validate the JSON body of a batch job progress poll (`/api/batch/progress/{jobId}`) and return it typed as `BatchJobProgressResponse`. It enforces numeric sanity and internal consistency (processed <= total, success+failed <= processed, equal when not processing).
- `useBatchActions` [partial/medium]: Core hook for running confirmable bulk actions against `/api/batch/:resource/:action`. It exposes status, progress, result and error. `execute` runs the action. `confirm` stages a config for a confirmation step. `cancel`, `reset` and `retryFailed` manage the lifecycle. It simulates progress by default or polls a server job when `useJobProgress` is set. It toasts, invalidates queries and calls the onSuccess/onError callbacks.
- `useReleaseBatchActions` [complete/high]: Convenience wrapper over useBatchActions for distribution releases. It offers submitReleases, deleteReleases and updateReleases, each with preset messages and invalidation of `/api/distribution/releases`.
- `useTrackBatchActions` [complete/high]: Wrapper for bulk studio track operations: move, tag, export (default wav) and delete. It invalidates `/api/studio/projects` except for export.
- `usePostBatchActions` [complete/high]: Wrapper for bulk social post operations: schedule, delete and approve. It invalidates the social posts, calendar and approvals queries.
- `useBeatBatchActions` [complete/high]: Wrapper for marketplace beat bulk operations: update prices, update license types and delete. It invalidates the marketplace beats queries.
- `useAnalyticsBatchActions` [complete/high]: Wrapper for bulk analytics operations: export (default csv, optional dateRange) and compare.

### `client/src/hooks/useBulkAction.ts`

React hooks for running bulk operations (delete, update, export, status change, submit, withdraw, schedule, process) against /api/batch/:resource/* endpoints. They manage a confirm/process/result state machine, progress, toasts, and React Query invalidation. The module also validates the server's bulk-result response.

- `parseBulkActionResponse` [complete/high]: Parse and strictly validate a bulk-operation HTTP response, ensuring the payload is consistent with the requested IDs, and return a typed BulkActionResult.
- `useBulkAction` [partial/high]: Core hook that exposes a bulk-action state machine (idle/confirming/processing/completed/partial/failed). It maps an action type to an API endpoint and method, runs the request, validates the result, updates progress, shows toasts, invalidates queries, and fires callbacks.
- `useBulkDelete` [complete/medium]: Convenience wrapper around useBulkAction that provides deleteItems(ids) for a resource, with preset messages and invalidation of /api/{resource}.
- `useBulkUpdate` [complete/medium]: Wrapper hook providing updateItems(ids, data) to bulk-update resource records and invalidate the resource's list query.
- `useBulkExport` [partial/medium]: Wrapper hook providing exportItems(ids, format='csv') to request a bulk export of resource items.
- `useBulkStatusChange` [complete/medium]: Wrapper hook providing changeStatus(ids, status) to bulk-change the status field of resource items.

### `client/src/hooks/useModuleShortcuts.ts`

Provides a React hook that registers a set of per-module keyboard shortcuts (studio, analytics, social, distribution, marketplace) with a shared ShortcutContext. It sets the active shortcut context, unregisters on cleanup, and returns that module's registered shortcuts. It also defines default shortcut tables with no-op handlers and thin per-module wrapper hooks that let callers override handlers by shortcut id.

- `useModuleShortcuts` [complete/medium]: Register a list of module-scoped shortcuts with the global shortcut registry while the component is mounted, activate the module's shortcut context, and return the shortcuts registered for that context.
- `useStudioShortcuts` [partial/medium]: Register the default studio shortcuts (transport, track, editing, view), letting callers override handlers per shortcut id.
- `useAnalyticsShortcuts` [partial/medium]: Register the default analytics shortcuts (refresh, export, date-range, compare, filter, fullscreen) with optional handler overrides by id.
- `useSocialShortcuts` [partial/medium]: Register the default social-media module shortcuts (schedule, preview, new-post, calendar, drafts, analytics, inbox) with optional handler overrides.
- `useDistributionShortcuts` [partial/medium]: Register the default distribution shortcuts (new-release, submit, upload, metadata, status, schedule) with optional handler overrides.
- `useMarketplaceShortcuts` [partial/medium]: Register the default marketplace shortcuts (search, filter, play preview, add to cart, favorite) with optional handler overrides.

### `client/src/lib/a11y/focus.ts`

Accessibility focus-management helpers for the React client. It covers saving and restoring focus and scroll position (including a stack-based singleton `focusManager`), moving focus within a container, computing next and previous focusable elements with wrap-around, applying custom focus-ring styles, editing tabindex, checking whether an element is focusable, and a focus scope that blocks tab access to elements outside a container (modal-style focus trap). It depends on `getFocusableElements` from `@/lib/accessibility`, which was not available for review. The inventory shows no callers for any symbol, but this is a library module and exports may be consumed elsewhere.

- `saveFocusState` [complete/high]: Snapshot the currently focused element and window scroll position so they can be restored later, for example when a modal or dialog closes.
- `restoreFocusState` [complete/high]: Return focus to a previously saved element if it is still in the DOM, then restore the saved scroll position.
- `FocusManager` [complete/medium]: Singleton that keeps a stack of saved focus states, supporting nested overlays that each restore focus on close.
- `focusFirstElement` [complete/high]: Focus the first focusable descendant of a container. If there is none, make the container itself programmatically focusable and focus it.
- `focusLastElement` [complete/high]: Focus the last focusable descendant of a container, for example for reverse tab wrapping.
- `focusByIndex` [complete/high]: Focus the Nth focusable element in a container, with bounds checking.
- `getNextFocusable` [complete/high]: Return the next focusable element after the current one in the container, wrapping around to the first.
- `getPreviousFocusable` [complete/high]: Return the previous focusable element before the current one in the container, wrapping around to the last.
- `createFocusIndicatorStyles` [complete/high]: Build a CSS declaration string (outline, offset, border-radius) for a focus ring from options with defaults.
- `applyFocusIndicator` [complete/high]: Attach focus and blur listeners that show a custom focus ring on an element, and return a cleanup function that removes the listeners and restores the original inline styles.
- `applyFocusIndicator.handleFocus` [complete/high]: Inner listener that applies the focus-ring inline styles when the element gains focus.
- `applyFocusIndicator.handleBlur` [complete/high]: Inner listener that restores the original inline outline styles when the element loses focus.
- `setTabOrder` [complete/medium]: Assign sequential explicit tabindex values to a list of elements, starting from startIndex.
- `removeFromTabOrder` [complete/high]: Take an element out of the keyboard tab sequence while keeping it programmatically focusable.
- `addToTabOrder` [complete/high]: Put an element into the tab sequence by setting its tabindex, defaulting to 0 (natural order).
- `isElementFocusable` [partial/medium]: Heuristically decide whether an element can receive keyboard focus.
- `moveFocusWithinContainer` [complete/high]: Move focus to the next or previous focusable element inside a container, for example for arrow-key navigation. It focuses the first element if focus is currently outside the container.
- `createFocusScope` [complete/medium]: Create a focus-trap-like scope for a container. lock() disables tab access to all focusable elements outside the container and unlock() restores them.
- `createFocusScope.lock` [partial/medium]: Set tabindex=-1 and a data-focus-scope-disabled marker on every focusable element outside the container, recording the original tabindex.
- `createFocusScope.unlock` [complete/high]: Restore the original tabindex of every element that lock() disabled and clear the marker attribute.

### `client/src/lib/a11y/keyboard.ts`

Keyboard-accessibility helpers for the client: a modal focus trap, a roving-tabindex controller for composite widgets (lists, toolbars, grids), a document-level Escape handler, simple arrow-key navigation within a container, and a typeahead matcher. Each setup function returns either a controller object or a cleanup function that removes its listeners.

- `createFocusTrap` [complete/medium]: Build a focus trap for a container (modal or dialog). While active, Tab and Shift+Tab wrap between the first and last focusable elements, outside clicks are blocked unless allowed, Escape calls a callback, and focus returns to the previously focused element on deactivate.
- `createFocusTrap.handleKeyDown` [partial/medium]: Document keydown listener that routes Tab to the wrap logic and Escape to the onEscape callback while the trap is active and not paused.
- `createFocusTrap.handleTabKey` [complete/high]: Wrap focus from the last element to the first on Tab, and from the first to the last on Shift+Tab.
- `createFocusTrap.handleClick` [complete/high]: Capture-phase click handler that blocks clicks outside the container and returns focus into it.
- `createFocusTrap.focusFirstElement` [complete/high]: Move focus into the trap. It prefers initialFocus (element or selector), then the first focusable element, then the container itself with tabindex=-1.
- `createFocusTrap.activate` [complete/high]: Turn the trap on: remember the currently focused element, attach listeners, and focus into the container on the next animation frame.
- `createFocusTrap.deactivate` [complete/high]: Turn the trap off, remove listeners, and optionally restore focus to the previously focused element.
- `createFocusTrap.pause` [complete/high]: Temporarily suspend the trap's handlers without removing them.
- `createFocusTrap.unpause` [complete/high]: Resume a paused trap.
- `createRovingTabIndex` [partial/medium]: Implement the roving-tabindex pattern. Exactly one matching item has tabindex=0, the rest -1, and arrow, Home and End keys move focus among items (supports vertical, horizontal, both, and grid layouts, with optional looping).
- `createRovingTabIndex.updateTabIndex` [complete/high]: Set tabindex=0 on the focused item and -1 on all others.
- `createRovingTabIndex.handleKeyDown` [complete/high]: Compute the next item index from the pressed key and orientation, wrap or clamp it, then focus the item, update tabindex, and notify onFocusChange.
- `createEscapeHandler` [complete/high]: Register a document-level Escape key handler that calls onEscape, with optional stopPropagation.
- `createEscapeHandler.handleKeyDown` [complete/high]: Handle Escape keydown by suppressing the default and invoking the callback.
- `setupArrowNavigation` [complete/high]: Lightweight arrow-key navigation among items in a container, in a single axis, with Home and End and optional looping. It does not manage tabindex.
- `setupArrowNavigation.handleKeyDown` [complete/high]: Resolve the next index for the arrow, Home, or End key, then focus that item and invoke onNavigate.
- `handleTypeahead` [complete/medium]: Create a typeahead matcher. Each call appends a character to a buffer that resets after a timeout, and returns the first item whose label starts with the buffer.

### `client/src/lib/video/TemplateCompiler.ts`

Client-side compiler that turns promo template options (release, tour, behind-the-scenes, quote, countdown, split-screen, teaser) into a renderer-ready VideoProject. It converts template layers to engine layer configs, extracts keyframes and audio-reactive bindings, estimates render time, builds default options, and offers helpers to rescale a project to another aspect ratio or append visualizer and particle layers.

- `generateId` [complete/high]: Generate a pseudo-unique prefixed ID from timestamp and random base36 string.
- `getDefaultTransform` [complete/high]: Return a fresh shallow copy of the default transform so callers can mutate it safely.
- `compileTemplate` [partial/high]: Public entry point: compile PromoTemplateOptions into a CompilationResult (project, layers, keyframes, audio bindings, metadata).
- `compileTemplateToCompiledTemplate` [complete/high]: Dispatch on options.type to the matching template compile function from PromoTemplates.
- `convertCompiledTemplateToResult` [complete/high]: Convert a CompiledTemplate into the final CompilationResult: layers, keyframes, bindings, VideoProject and metadata.
- `convertTemplateLayers` [complete/medium]: Map every template layer to an engine LayerConfig.
- `convertTemplateLayer` [complete/medium]: Convert one TemplateLayer into a LayerConfig, copying base fields, mapping type and config, and attaching only the first animation.
- `mapLayerType` [complete/high]: Map template layer type names to engine layer types (video becomes image; unknown becomes background).
- `convertLayerConfig` [complete/high]: Dispatch layer config conversion by layer type to the matching converter.
- `convertBackgroundConfig` [complete/high]: Translate template background config (gradientColors, gradientAngle) to engine BackgroundConfig (colors, angle).
- `convertTextConfig` [complete/high]: Translate template text config to engine TextConfig, applying defaults (Inter, 24, white, center, middle).
- `convertImageConfig` [complete/high]: Translate template image/video config to engine ImageConfig, with src falling back to imageUrl and fit defaulting to contain.
- `convertShapeConfig` [complete/high]: Translate template shape config (shapeType) to engine ShapeConfig (type).
- `convertParticleConfig` [complete/high]: Translate template particle config to engine ParticleConfig with defaults; emission area defaults to the full canvas.
- `convertVisualizerConfig` [complete/high]: Translate template visualizer config (visualizerType) to engine VisualizerConfig.
- `extractKeyframes` [complete/high]: Flatten each layer's animations into start and end keyframes and sort them by time.
- `extractAudioReactiveBindings` [complete/medium]: Build the audio-reactive binding list from per-layer settings (bass, smoothing 0.8) plus global option targets that are not already bound.
- `estimateRenderTime` [complete/medium]: Heuristically estimate render time in seconds (16ms per frame scaled by layer count).
- `createVideoProjectFromTemplate` [complete/high]: Convenience API: fill partial options with defaults, compile, and return only the VideoProject.
- `buildFullOptions` [complete/high]: Complete partial template options with defaults (palette, background, generated id, per-type placeholders) and set the type discriminant.
- `scaleProjectToAspectRatio` [partial/medium]: Rescale project dimensions, layer transforms, layer config and positional keyframes to a target aspect ratio preset.
- `scaleLayerConfig` [partial/medium]: Scale size-related config fields (fontSize, width, height, radius, barWidth, lineWidth) by the scale factors.
- `addVisualizerToProject` [complete/high]: Return a new project with an audio visualizer layer appended (defaults: spectrum, 64 bars, glow, centered).
- `addParticlesToProject` [complete/high]: Return a new project with a particle layer appended (defaults: 100 circles, multi-color, full-canvas emission).

### `external/maxcore/artifacts/ai-training-server/ai_model/director/analytics.py`

Performance-analytics feedback loop for the AI 'director'. It defines a PerformanceRecord dataclass for observed engagement on deployed content, a pluggable AnalyticsSource protocol with two backends (JSONL file, and a pdim key-value store that falls back to the file), and a FeedbackLoop facade. FeedbackLoop persists engagement metrics and turns recent records into per-platform hint strings for future generation.

- `PerformanceRecord` [complete/high]: Dataclass holding observed performance of one deployed content item: ids, platform, modality, impressions, engagements, completion_rate, ctr and a recorded_at timestamp.
- `PerformanceRecord.engagement_rate` [complete/high]: Derived property giving engagements per impression, guarding against division by zero.
- `PerformanceRecord.to_dict` [complete/high]: Serialize the record to a plain dict for JSON persistence.
- `PerformanceRecord.from_dict` [complete/high]: Build a record from a dict, ignoring unknown keys so stored data from older or newer schemas still loads.
- `AnalyticsSource` [complete/high]: Structural Protocol defining the pluggable analytics backend interface: get_recent and record.
- `AnalyticsSource.get_recent` [complete/high]: Protocol method: return recent performance records, optionally filtered by platform and modality, capped at limit.
- `AnalyticsSource.record` [complete/high]: Protocol method: persist one PerformanceRecord and report success.
- `FileAnalyticsSource` [complete/high]: Local JSONL-backed analytics store that always works and survives restarts.
- `FileAnalyticsSource.__init__` [complete/high]: Store the file path, defaulting to ~/.maxcore/director/analytics.jsonl.
- `FileAnalyticsSource.get_recent` [complete/high]: Read the JSONL file, filter by platform and modality, and return up to `limit` records, newest first. Fail-soft.
- `FileAnalyticsSource.record` [complete/high]: Append a record as one JSON line, stamping recorded_at if unset.
- `PdimAnalyticsSource` [complete/high]: Production analytics backend that stores records in the pdim key-value store under 'director:analytics', with a FileAnalyticsSource as fallback and as a dual-write mirror.
- `PdimAnalyticsSource.__init__` [complete/high]: Create the file fallback source.
- `PdimAnalyticsSource._pdim` [complete/medium]: Lazily obtain the pdim storage client, returning None if the import or acquisition fails.
- `PdimAnalyticsSource.get_recent` [complete/high]: Read records from pdim (a single JSON list under one key), filter and sort them, and fall back to the file source if pdim is unavailable, empty or errors.
- `PdimAnalyticsSource.record` [complete/high]: Persist a record to the file and also append it to the pdim list, capped at the last 1000 entries.
- `FeedbackLoop` [complete/high]: Facade that records real engagement metrics and derives performance hints for future generation, closing the generate → deploy → measure loop.
- `FeedbackLoop.__init__` [complete/high]: Set the analytics source, defaulting to PdimAnalyticsSource.
- `FeedbackLoop.get_hints` [complete/high]: Summarize the last ≤20 records for a platform into string hints: mean engagement rate of the top 5, sample size, the modality most common among the top performers, and (with ≥10 records) the mean engagement rate of the bottom 5.
- `FeedbackLoop.record_feedback` [complete/high]: Convert a raw metrics dict into a PerformanceRecord, timestamp it and persist it via the source.

### `external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py`

Pure-Python/NumPy execution substrate that emulates CUDA's thread/block/warp model on the 'digital GPU'. SM102 kernel bodies are Python functions that take a per-block CUDARuntime and use its shared memory, sync, warp-shuffle, atomic and math helpers. launch_kernel iterates the grid and calls the kernel once per block. It is explicitly not a CUDA interpreter.

- `Dim3` [complete/high]: Mirror CUDA's dim3: an (x, y, z) triple for thread, block or grid dimensions.
- `Dim3.__init__` [complete/high]: Store x, y, z, defaulting missing dimensions to 1 as in CUDA.
- `Dim3.from_arg` [complete/high]: Coerce a Dim3, int, or tuple/list of up to 3 ints into a Dim3, mimicking CUDA's <<<grid, block>>> launch args.
- `Dim3.__repr__` [complete/high]: Readable debug string.
- `Dim3.volume` [complete/medium]: Total element count (x*y*z), e.g. threads per block.
- `SharedMemory` [complete/high]: Model per-block CUDA __shared__ memory as a fixed-size float32 NumPy scratchpad.
- `SharedMemory.__init__` [complete/high]: Allocate a zeroed float32 buffer of n_floats elements.
- `SharedMemory.view` [complete/high]: Return a slice view of the buffer so kernels can work on named regions, as in m_i = shm.view(0, T).
- `SharedMemory.__getitem__` [complete/high]: Index read passthrough to the buffer.
- `SharedMemory.__setitem__` [complete/high]: Index write passthrough to the buffer.
- `SharedMemory.reset` [complete/high]: Zero the scratchpad.
- `SharedMemory.nbytes` [complete/high]: Report the scratchpad size in bytes.
- `WarpState` [partial/medium]: Model one 32-lane warp with its lane values and warp-level reduction primitives.
- `WarpState.__init__` [complete/high]: Create a zeroed 32-lane float32 buffer and optionally preload up to 32 values.
- `WarpState.load` [complete/medium]: Overwrite the first min(len, 32) lanes with the given values.
- `WarpState.shfl_down_sync` [partial/high]: Perform one butterfly/tree-reduction step across all 32 lanes: each lane adds the value from lane+offset, and lanes with no source keep their own value. The name mirrors CUDA's __shfl_down_sync.
- `WarpState.reduce_sum` [complete/high]: Full warp horizontal sum by repeated shfl_down steps with offsets 16, 8, 4, 2, 1.
- `_AtomicFloat` [dead/medium]: Lock-protected float32 accumulator modelling atomicAdd on a scalar.
- `_AtomicFloat.__init__` [complete/high]: Initialise the float32 value and lock.
- `_AtomicFloat.add` [complete/high]: Thread-safely add delta to the accumulator in float32.
- `_AtomicFloat.value` [complete/high]: Read the current value as a Python float.
- `_AtomicFloat.reset` [complete/high]: Reset the accumulator to 0 under the lock.
- `atomic_add` [complete/high]: Emulate CUDA atomicAdd on an array element. Single-threaded execution makes a plain += sufficient.
- `CUDARuntime` [complete/high]: Per-block execution context handed to kernel functions. It exposes thread, block and grid indices plus shared memory, sync, warp, atomic, math and fp16 conversion helpers in place of CUDA intrinsics.
- `CUDARuntime.__init__` [complete/high]: Store the launch geometry and optionally pre-allocate shared memory. Also creates a WarpState and an unused atomics dict.
- `CUDARuntime.shared` [complete/high]: Return the block's shared memory, allocating or growing it on demand to at least n_floats.
- `CUDARuntime.syncthreads` [stub/high]: Stand-in for __syncthreads(). It is a no-op because each block runs sequentially and vectorised.
- `CUDARuntime.shfl_down_sync` [complete/high]: Delegate to WarpState.shfl_down_sync.
- `CUDARuntime.warp_reduce_sum` [complete/high]: Delegate to WarpState.reduce_sum to get a warp-wide sum.
- `CUDARuntime.atomic_add` [complete/high]: Delegate to the module-level atomic_add.
- `CUDARuntime.rsqrtf` [complete/medium]: Reciprocal square root, mirroring CUDA rsqrtf.
- `CUDARuntime.expf` [complete/high]: Single-precision exponential, mirroring CUDA expf.
- `CUDARuntime.fmaxf` [complete/medium]: Scalar max, mirroring CUDA fmaxf.
- `CUDARuntime.float2half` [complete/high]: Convert an array to float16, mirroring the CUDA conversion intrinsic.
- `CUDARuntime.half2float` [complete/high]: Convert an array to float32.
- `launch_kernel` [complete/high]: Drive a Python kernel over a CUDA-style grid by building a fresh CUDARuntime per block and calling kernel_fn(rt, *args) once per block. Kernels are assumed to be vectorised over threads.

### `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py`

Defines the abstract Backend interface (ABC) that all DigitalGPU compute backends must implement: primitive tensor kernels (create_tensor, gemm, add, relu, softmax, attention, conv2d, mlp, reduce) plus default availability, op-support and info helpers. The runtime dispatches IR ops to these methods so backends are interchangeable.

- `Backend` [complete/high]: Abstract base class declaring the contract for DigitalGPU backends. Subclasses must implement the nine kernel methods; availability, supports and info have permissive defaults. The class attribute `name` identifies the backend.
- `Backend.create_tensor` [complete/high]: Abstract: convert raw data into the backend's native tensor representation with the given dtype (default float32).
- `Backend.gemm` [complete/high]: Abstract: general matrix multiply a @ b with optional bias addition and optional fused activation.
- `Backend.add` [complete/high]: Abstract: elementwise addition of two tensors.
- `Backend.relu` [complete/high]: Abstract: elementwise ReLU activation.
- `Backend.softmax` [complete/high]: Abstract: softmax over a given axis (default last).
- `Backend.attention` [complete/high]: Abstract: scaled dot-product attention over q, k, v with optional mask and causal masking.
- `Backend.conv2d` [complete/high]: Abstract: 2D convolution with optional bias, stride and padding.
- `Backend.mlp` [complete/medium]: Abstract: fused two-layer MLP (x@w1+b1, activation, @w2+b2).
- `Backend.reduce` [complete/medium]: Abstract: reduction of a tensor over an axis using a named op (sum/mean/max, etc.).
- `Backend.is_available` [complete/high]: Report whether the backend can run on this host. The default is True; subclasses such as GPU backends override it to check for hardware.
- `Backend.supports` [complete/medium]: Report whether the backend supports a named op. The default says yes to everything; subclasses may restrict.
- `Backend.info` [complete/high]: Return a small descriptor dict with the backend name and availability, for smi/diagnostics.

### `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py`

Declares honest, non-functional plug-points for future MaxCore backends (cluster and ASIC). Each reports unavailable and raises NotImplementedError with a contract describing what a real implementation must do, so the registry, runtime and API stay backend-agnostic without faking functionality.

- `_FutureBackend` [stub/high]: Abstract base for not-yet-implemented backends. It reports unavailable and makes every kernel op in the Backend interface fail loudly with the subclass's contract text.
- `_FutureBackend.is_available` [complete/high]: Signals to the registry and callers that this backend cannot be used on this host.
- `_FutureBackend._nyi` [complete/high]: Central helper that raises NotImplementedError naming the backend and op and appending the contract text.
- `_FutureBackend.create_tensor` [stub/high]: Placeholder for tensor creation. It always raises NotImplementedError.
- `_FutureBackend.gemm` [stub/high]: Placeholder for matrix multiply. It always raises NotImplementedError.
- `_FutureBackend.add` [stub/high]: Placeholder for elementwise add. It always raises NotImplementedError.
- `_FutureBackend.relu` [stub/high]: Placeholder for the ReLU activation. It always raises NotImplementedError.
- `_FutureBackend.softmax` [stub/high]: Placeholder for softmax. It always raises NotImplementedError.
- `_FutureBackend.attention` [stub/high]: Placeholder for the attention kernel. It always raises NotImplementedError.
- `_FutureBackend.conv2d` [stub/high]: Placeholder for 2D convolution. It always raises NotImplementedError.
- `_FutureBackend.mlp` [stub/high]: Placeholder for the fused MLP op. It always raises NotImplementedError.
- `_FutureBackend.reduce` [stub/high]: Placeholder for reduction ops. It always raises NotImplementedError.
- `ClusterBackend` [stub/high]: Named plug-point for a distributed multi-node backend. Its contract describes partitioning the graph over RPC, sharding the KV-cache and all-reducing at BARRIER ops.
- `ASICBackend` [stub/high]: Named plug-point for a future ASIC backend. Its contract describes lowering MaxCore IR to ASIC microcode with DMA engines, on-chip KV-cache and tensor units.

### `reports/aso/isolated-full-20261106T233139Z/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py`

(analysis failed: ValueError)


### `reports/test-verification/final-map-refresh/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py`

(analysis failed: ValueError)


### `reports/test-verification/final-plan-fix/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py`

(analysis failed: ValueError)


### `reports/test-verification/full-current/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py`

(analysis failed: ValueError)


### `script/deployment/executive.mjs`

Deployment 'executive': a dependency-aware, resource-admitting task scheduler for the build and start phases of the Max Booster deployment. It validates a task plan, adds build-phase ordering edges, spawns each task as a detached process group, and admits tasks against live CPU, memory and I/O capacity. It enforces per-task and overall deadlines, retries on selected signals with backoff, probes application readiness, and tears down process trees on exit. The CLI entrypoint `main('build'|'start')` wires up the plan, signal binding, a temp state dir, and failure checkpoint reporting. A large block comment in the middle holds quarantined, malformed duplicate copies of the scheduler tail and of `main`; the live code is the part above the comment plus the final `main` below it.

- `now` [complete/high]: Monotonic millisecond clock (performance.now) used for all scheduler timing, so deadlines are unaffected by wall-clock changes.
- `signalGroup` [complete/high]: Send a signal to an entire process group (negative pid), ignoring groups that are already gone.
- `liveGroup` [complete/high]: List live (non-zombie, non-dead) processes whose process-group id equals the given pid, by scanning /proc.
- `bounded` [complete/high]: Run an operation with a timeout, rejecting with code DEPLOY_OPERATION_TIMEOUT if it takes too long.
- `stopJob` [complete/high]: Reliably stop a task job: first the owned-process tracker (which also covers descendants in other sessions), then the whole process group with SIGTERM then SIGKILL. Throws if members are still alive afterwards.
- `bindShutdownSignals` [complete/high]: Wire SIGINT/SIGTERM/SIGHUP on an emitter to abort an AbortController with a structured DEPLOY_EXECUTIVE_SIGNAL error, and return an unbind function.
- `bindShutdownSignals.handler` [complete/high]: Per-signal handler that aborts the controller once, with metadata identifying the signal.
- `validatePlan` [complete/high]: Validate the shape and constraints of a task plan: unique string ids, non-empty command, string args/deps, non-negative finite cpu/io/memoryMB, and bounded retry/timeout/signal options. Rejects unknown prerequisites and dependency cycles.
- `validatePlan.visit` [complete/high]: DFS helper for detecting unknown prerequisites and cycles in the task graph.
- `coordinateBuildPlan` [complete/high]: Return a copy of the build plan with mandatory phase-ordering dependencies added (dependencies → app_capsule/packer → prune → pack_node → source → remainder → finalize). Throws if a required phase is missing while its dependent exists.
- `runExecutive` [complete/high]: Core scheduler. It runs a validated plan of tasks as detached child processes, respecting dependencies and live capacity (CPU slots, memory reservation, I/O slots). It supports elastic CPU sharing, retries with exponential backoff on selected signals, a global budget and per-task deadlines, readiness polling for the application task, abort-signal handling, admission timeout, and guaranteed cleanup of children. On failure it attaches checkpoint metadata to the error.
- `runExecutive.rank` [complete/high]: Memoized critical-path priority: 1 + max rank of successors, so tasks with longer downstream chains are scheduled first.
- `runExecutive.checkpoint` [complete/high]: Build a per-task state snapshot (completed/running/failed/retry-backoff/waiting) for error diagnostics.
- `runExecutive.concurrentlyAdmissible` [complete/medium]: Estimate how many of the eligible tasks from `index` onward could be started concurrently under the CPU, memory and I/O limits, so the free CPUs can be divided fairly among elastic tasks.
- `runExecutive.abort` [complete/high]: Convert the AbortSignal's reason into the executive's `failure` error, preserving DEPLOY_EXECUTIVE_SIGNAL errors, and wake the scheduler.
- `runExecutive.notify` [complete/high]: Mutable wake-up hook. It defaults to a no-op and is replaced by `finish` while the scheduler sleeps, so child close/error/abort wake the loop immediately.
- `runExecutive.finish` [complete/medium]: Resolver for the scheduler's wait promise. It clears the timer, resets notify, and resolves.
- `main (L837-951, inside block comment)` [dead/high]: Quarantined, earlier variant of the executive entrypoint (with project root chdir, budget and bootstrap validation). It is inert because it sits inside the /* ... */ comment.
- `main (L1264-1292, inside block comment)` [dead/high]: Second quarantined, truncated copy of main, with garbled text splicing into a mangled spawn block.
- `unbind (in commented main)` [dead/high]: Placeholder no-op for the signal unbinder in the quarantined main. It is inert.
- `finish (in commented duplicate)` [dead/high]: Duplicate of the wait-promise resolver, inside the quarantined text.
- `main (L1358-1414, live)` [partial/medium]: Live CLI entrypoint. For mode 'build' or 'start' it builds and validates the plan and creates a temp state dir. It binds shutdown signals and computes the budget (minus bootstrap elapsed time for build). It logs detected resources, runs runExecutive (with an /api/ready readiness probe in start mode), and on failure prints a JSON task checkpoint to stderr and rethrows. Finally it unbinds signals, removes the state dir and bootstrap dir, and terminates the boot stub pid.
- `handler` [complete/high]: See bindShutdownSignals.handler; the inventory duplicates it.

### `script/lib/provisionPortablePython.mjs`

Provisions an isolated, pinned portable CPython (python-build-standalone 3.12.13, x86_64 linux gnu) into <root>/python_runtime. It reuses an existing runtime if it passes verification. Otherwise it downloads and validates the archive, extracts it into a staging dir, installs and verifies locked dependencies, and swaps the staged runtime in with backup/rollback. It can be run as a CLI script or imported.

- `command` [complete/high]: Thin synchronous wrapper around spawnSync that runs an external command, throws on spawn error or non-zero exit (including the last 2000 chars of stderr), and returns stdout as a string.
- `downloadArchive` [complete/high]: Downloads the release tarball with curl, with HTTPS-only enforcement, TLS 1.2 minimum, retries, and connect and total timeouts.
- `validateArchive` [complete/high]: Safety-checks the tarball listing before extraction. It requires python/bin/python3 and rejects any member that is absolute, uses '..' traversal, or lies outside the 'python/' root.
- `runRuntimeCheck` [complete/high]: Verifies a runtime directory. It checks that bin/python3 is an executable regular file, that its version matches the expected one, and that the dependency installer script passes in --verify-only mode.
- `replaceRuntime` [complete/high]: Swaps the staged runtime into place with rollback. The existing runtime directory is renamed to a UUID-named backup, the staged one is renamed into place, and the backup is deleted on success. On failure the backup is restored.
- `provisionPortablePython` [complete/high]: Main entry point. It ensures <root>/python_runtime holds a verified portable Python at the pinned version. It reuses the existing runtime if it passes full verification. Otherwise it stages a fresh download, validates it, extracts it, installs and verifies dependencies, and atomically replaces the runtime. The staging dir is always cleaned up.

### `scripts/database-recovery-drill.mjs`

Top-level executable script that runs a live database recovery drill. It takes a read-only, repeatable-read snapshot of the Neon primary database, dumps it with pg_dump at that exported snapshot, and optionally retains the dump in private managed storage. It then restores the dump into a disposable loopback-only local PostgreSQL cluster and compares schema fingerprints, per-table row counts and content hashes. Finally it writes sanitized Markdown and JSON reports and sets the process exit code on failure.

- `sourceIdentityParts` [complete/high]: Collect the sensitive parts of the source connection URL (host, user, password, database name; each at least 3 chars) so later diagnostics can redact them.
- `digest` [complete/high]: Compute a SHA-256 hex digest of a string or buffer.
- `currentRecoverySource` [complete/high]: Bind retained backup evidence to the exact recovery implementation by hashing the recovery source files and reading the git HEAD revision.
- `escapeRegExp` [complete/high]: Escape regex metacharacters so a literal secret can be used in a RegExp.
- `sanitizeDiagnostic` [complete/high]: Scrub error or diagnostic text before it goes into reports: Postgres diagnostic sanitization, source identity values, the temp path, and the ephemeral port.
- `quoteIdentifier` [complete/high]: Quote a SQL identifier by wrapping it in double quotes and doubling embedded quotes.
- `qualified` [complete/high]: Build a quoted schema.table reference from an inventory row.
- `recordCheck` [complete/high]: Record a named pass/fail check in the result and abort the drill by throwing on failure.
- `commandEnv` [complete/high]: Build a minimal, deterministic environment for child processes, with HOME pointing at the scratch dir.
- `run` [complete/high]: Synchronously execute an external command (initdb, pg_ctl, psql) with a controlled environment and timeout, returning stdout and throwing a sanitized error on non-zero exit.
- `tableInventory` [complete/high]: Enumerate user tables and compute, per table, an exact row count and an order-independent content hash, to compare source and restored target.
- `schemaEvidence` [complete/high]: Collect canonical catalog definitions (relations, columns, types, constraints, indexes, functions, sequences, triggers, policies) and fingerprint them for source vs restored schema parity.
- `_identity_arguments` [dead/high]: Not a real symbol. The extractor mis-parsed the SQL fragment `pg_get_function_identity_arguments(p.oid)` inside the functions query template string.
- `def` [dead/high]: Not a real symbol. The extractor mis-parsed text inside the SQL template (likely the `pg_get_functiondef(p.oid)` call).
- `mkdirSyncCompat` [complete/high]: Create a mode-700 directory for the Postgres Unix socket via the `mkdir -m 700` command, avoiding any workspace helper imports.

### `scripts/readiness-assembled-acceptance.mjs`

Sealed, self-contained 'assembled acceptance' drill for the Max Booster readiness work. Run via `env -i ... node scripts/readiness-assembled-acceptance.mjs [--http-load]`, it refuses to start if sensitive env vars are inherited. It reserves ephemeral ports for a disposable local Postgres, the app and PDIM, then boots the real app against them. It checks health, readiness, the frontend, the HTTP auth journey (CSRF, register, login, logout, project CRUD with optimistic versioning), a Chromium browser journey with a route sweep, an egress guard, and an authenticated HTTP load run with memory-admission snapshots. It writes JSON and Markdown evidence reports under reports/readiness-implementation/ and cleans up afterwards. With `--http-load` it runs only the HTTP-load mode and skips Chromium.

- `reserveEphemeralPort` [complete/high]: Obtain a free TCP port on 127.0.0.1 by binding to port 0, reading the assigned port, then closing the listener. Used for the Postgres, app and PDIM ports.
- `sanitizedLogTail` [complete/high]: Return a redacted tail of the app process log for failure reports. It prefers the longer of the in-memory tail and the on-disk log, and redacts postgres URLs and authorization/token/secret/password values.
- `run` [complete/high]: Synchronously run a child command (such as a build or schema tool) with a given env and timeout. Throw a sanitized error on a non-zero exit and return stdout otherwise.
- `request` [complete/high]: Promise-based HTTP client for the local app on 127.0.0.1:appPort. It supports JSON bodies, cookie and CSRF headers, a timeout, and a 256KB cap on the captured body.
- `updateCookieJar` [complete/high]: Apply Set-Cookie headers to a Map-based cookie jar. It stores name=value pairs and deletes a cookie when its value is empty.
- `cookieHeader` [complete/high]: Serialize the cookie jar into a Cookie header string.
- `jsonBody` [complete/high]: Parse a response body as JSON, and throw a descriptive error that names the content type if parsing fails.
- `authRequest` [complete/high]: Cookie-jar-aware wrapper over request. It sends the jar's cookies with a 15s timeout and updates the jar from Set-Cookie headers in the response.
- `runHttpAuthJourney` [complete/high]: Exercise the full HTTP auth lifecycle against the real app. It bootstraps CSRF and checks that the body and cookie match, registers a user, and checks the response omits the password. It then grants a pro entitlement directly in the disposable DB and checks the session persists across requests. After that it logs out, confirms /api/auth/me returns null, logs back in, runs project CRUD, logs out again and confirms the session is invalidated.
- `runProjectCrud` [unclear/medium]: Verify project create, read, and optimistic-concurrency update behaviour for an owned project. A PATCH without a version must return 428. A PATCH with the correct expectedUpdatedAt must succeed. A stale-version PATCH is then attempted (the remainder is truncated in the excerpt and presumably also covers delete and ownership checks).
- `fetchJsonFromPort` [unclear/low]: Fetch and parse JSON from an arbitrary local port, probably the browser debugging endpoint (CDP /json) or the app. Body not shown.
- `runBrowserJourney` [unclear/low]: Drive a headless Chromium instance (via the DevTools protocol over the imported ws module) through the app: register and login UI flows, navigate and sweep routes, and collect evidence. It is a large function (L298-670) containing nested helpers such as rejectPending, command, isContextTransition, evaluate, browserApi, navigateUntil and sweepRoutes.
- `browserApi` [unclear/low]: Nested helper in runBrowserJourney, probably performing an API call from within the browser page context (fetch via evaluate). Body not shown.
- `navigateUntil` [unclear/low]: Nested helper that probably navigates the browser to a URL and waits until a condition holds. Body not shown.
- `sweepRoutes` [unclear/low]: Nested helper that probably visits a list of client routes in the browser and checks that each renders without errors. Body not shown.
- `waitFor` [unclear/low]: Generic polling helper that waits for a predicate or condition with a timeout. Body not shown.
- `sha256` [unclear/medium]: Hex SHA-256 digest of its input, using the imported createHash.
- `memoryAdmissionSnapshot` [unclear/low]: Capture a memory and admission-control snapshot of the app, probably process RSS, heap and capacity-admission signals, for the load evidence. Body not shown.
- `nearestRank` [unclear/medium]: Compute a percentile using the nearest-rank method over a sorted sample, for load latency statistics (inferred from the name).
- `createLoadSession` [unclear/low]: Create an authenticated user session for load testing, probably by registering a user and logging in through the HTTP API to obtain a cookie jar and CSRF token. Body not shown.
- `runAuthenticatedHttpLoad` [unclear/low]: Run the bounded authenticated HTTP load phase. It uses sessions from createLoadSession, latency percentiles from nearestRank and memory snapshots, and records the results in evidence.httpLoad.
- `rejectPending` [unclear/low]: Nested helper in the browser journey that rejects all pending CDP command promises, probably when the WebSocket closes or errors.
- `command` [unclear/low]: Nested helper that sends a DevTools-protocol command over the WebSocket and returns a promise for its response. Body not shown.
- `isContextTransition` [unclear/low]: Predicate, probably detecting a CDP error that means the page execution context was destroyed or navigated, so the caller can retry. One-line body, not shown.
- `evaluate` [unclear/low]: Nested helper that runs a JavaScript expression in the browser page via Runtime.evaluate and returns the result, probably retrying across context transitions. Body not shown.
- `retainAppLogTail` [unclear/low]: Probably appends app process output to the bounded in-memory appLogTail, which sanitizedLogTail later reads. Body not shown.

### `scripts/simulate-production.mjs`

(withheld: contains a possible secret)


### `scripts/test-data-runtime.mjs`

Standalone boundary/integration test script for the data-runtime layer. Run with a clean environment (`env -i PATH=... node scripts/test-data-runtime.mjs`), it uses esbuild to bundle real server modules with external I/O replaced by in-memory mocks. It covers four areas: authoritative session store and revocation (D6), BullMQ retention-worker quarantine (D7), PDIM RedisStore snapshot/AOF recovery and legacy conversion (D4), and database backup/restore plus scheduler shutdown semantics (D1-D3). Failures surface as assert exceptions; success prints PASS lines. Several 'symbols' in the inventory are not real module functions. They are fragments of JavaScript source held in template-literal mocks, or small local helpers.

- `bundle` [complete/high]: Test harness helper. Bundles a TypeScript/JS entry with esbuild, substituting virtual 'mock' modules for any import whose path matches a supplied regex. It then dynamically imports the bundle so the real module runs against fakes.
- `prepareConversion` [complete/high]: Write the legacy-recovery fixture files (snapshot, AOF, stream export, approval JSON) to disk. The approval carries SHA-256 hashes of the three data files, so convertLegacy can be exercised and then re-run with mutated fixtures.
- `selectPgDumpForServer` [complete/high]: Mock, embedded as source text in the postgresTools mock. It pretends to pick a pg_dump 17 binary for a server URL and records the selection into backupTest.toolSelections.
- `dumpedServerMajor` [complete/high]: Mock, embedded as source text. It parses the major PostgreSQL version from the '-- Dumped from database version N' header in the first 8 KiB of a dump buffer.
- `dumpedServerVersion` [complete/high]: Mock, embedded as source text. It parses the full version string (e.g. '17.11') from the dump header.
- `selectPsqlForRestore` [complete/high]: Mock, embedded as source text. It pretends to pick a psql 17 binary for the restore target and records the selection.
- `safePostgresDiagnostic` [complete/medium]: Mock, embedded as source text. A pass-through that stringifies a diagnostic value, standing in for the real sanitizer.
- `spawn` [complete/high]: Mock child_process.spawn, embedded as source text. It records the command, args and options, then asynchronously emits fake output and a close event. pg_dump yields a small SQL dump with a version-17.11 header; any other command yields empty stdout.
- `sql` [complete/high]: Mock for drizzle-orm's `sql` tagged template. It returns the raw strings and values so tests can inspect query text.
- `sessionAuthority` [complete/high]: Mock of the services/sessionAuthority export. It is an async factory returning globalThis.testAuthority, whose validate and revoke the tests override. Appears twice, once per bundled module (L41 and L92).
- `readSession` [complete/high]: Local helper that promisifies store.get('sid', cb), resolving with session data (or null) and rejecting on error. It lets the tests assert authority validation and fail-closed behaviour.
- `getRedisClient` [complete/high]: Mock of the redisClient export for the sessionConfig bundle. It throws, so any attempt to use transient Redis for revocation fails the test.
- `isPdimConfigured` [complete/high]: Mock of the pdimClient export. It reports PDIM as not configured, so the sessionConfig code takes the non-PDIM path.
- `newBullMQRedisConnection` [complete/high]: Mock of the redisClient export for the scaleJobQueue bundle. It returns an empty object as a fake connection, so no Redis is touched.
- `flushFeatureEvents` [complete/high]: Mock of the featureEventBuffer export. An async no-op, so the 'feature-event-flush' job can run without side effects.
- `encode` [stub/high]: No-op mock of @msgpack/msgpack encode, so RedisStore's module can be bundled without the real dependency. The test uses only the JSON recovery path.
- `decode` [stub/high]: No-op mock of @msgpack/msgpack decode, paired with encode above.
- `deferred` [complete/high]: Create a manually controllable promise, returning the promise plus resolve and reject. The shutdown tests use it to pause uploads and heartbeat renewals at precise moments.
- `tick` [complete/high]: Yield to the event loop for one setImmediate turn, so pending microtasks and callbacks flush.

### `scripts/testing/page80-acceptance.mjs`

Sealed, self-contained 'page 80' acceptance harness for Max Booster. It is run with a scrubbed environment (`env -i`). It refuses to start if sensitive variables are inherited. It reserves ephemeral ports for a disposable Postgres, the app and PDIM. It starts the app, then checks health, readiness, frontend, HTTP auth, project CRUD, an optional bounded authenticated HTTP load, and a Chromium browser journey with route sweeps. It records evidence and failures to JSON/Markdown reports. Only the first ~300 lines are visible; later functions are inferred from names and inventory line ranges.

- `reserveEphemeralPort` [complete/high]: Obtain a free TCP port on 127.0.0.1 by binding port 0, reading the assigned port, then closing the listener, so Postgres, app and PDIM ports do not collide.
- `sanitizedLogTail` [complete/high]: Return a redacted tail of the app log for inclusion in reports, so failures can be diagnosed without leaking DB URLs or credentials.
- `run` [complete/high]: Synchronously run a child command (e.g. schema generation or db setup) with an explicit env. Throw a sanitized error on non-zero exit.
- `request` [complete/high]: Promise-based HTTP client against the local app on 127.0.0.1:appPort. It simulates an HTTPS proxy and supports JSON bodies, cookies, CSRF header and a spoofed client IP.
- `updateCookieJar` [complete/high]: Apply Set-Cookie headers to a Map-based cookie jar, storing name→value and deleting cookies set to an empty value.
- `cookieHeader` [complete/high]: Serialize the cookie jar into a Cookie request header string.
- `jsonBody` [complete/high]: Parse a response body as JSON, throwing a descriptive error that includes the content type if parsing fails.
- `authRequest` [complete/high]: Make a request with a session's cookie jar and per-jar spoofed client IP, then absorb any Set-Cookie headers back into the jar.
- `runHttpAuthJourney` [complete/high]: Verify the full HTTP auth lifecycle against the live isolated app. The steps are CSRF bootstrap with cookie/body binding, register, DB-granted pro entitlement, session persistence, logout, login, project CRUD, and final logout.
- `runProjectCrud` [complete/medium]: Exercise project create, read, optimistic-concurrency update and presumably delete for an authenticated owner. A mutation without a version must be rejected with HTTP 428.
- `fetchJsonFromPort` [unclear/low]: Fetch and parse JSON from an arbitrary local port, likely to query the app or PDIM/diagnostic endpoints other than the main app port.
- `runBrowserJourney` [unclear/low]: Drive a Chromium session (via the CDP WebSocket and the browserApi helper) through the user journey and route sweeps, and record browser evidence. This is the mode skipped under --http-load.
- `browserApi` [unclear/low]: Probably a helper that issues API calls from within the browser page context, or wraps a browser CDP command.
- `navigateUntil` [unclear/low]: Navigate the browser to a URL and wait until a condition is met, such as a ready predicate or a URL/context settle.
- `sweepRoutes` [unclear/low]: Visit a set of frontend routes in the browser and record per-route results, such as load success, console errors or egress violations.
- `waitFor` [unclear/low]: Generic polling helper that waits for a condition with timeout and a descriptive failure.
- `sha256` [complete/medium]: Hex SHA-256 digest of input, using the imported createHash.
- `memoryAdmissionSnapshot` [unclear/low]: Capture a memory or capacity snapshot, probably of the app process or system, to support the 'capacityAdmission' evidence gate before or after load.
- `nearestRank` [complete/medium]: Compute a percentile using the nearest-rank method over a numeric sample, probably for load latency p95/p99.
- `createLoadSession` [unclear/low]: Create an authenticated user session (cookie jar with CSRF and a unique spoofed client IP) for use by load workers.
- `runAuthenticatedHttpLoad` [unclear/low]: Run the bounded authenticated HTTP load test in --http-load mode, using many sessions and requests and computing latency percentiles and error counts. It populates evidence.httpLoad.
- `rejectPending` [unclear/low]: Reject outstanding pending CDP or WebSocket command promises, probably when the browser connection closes or errors.
- `command` [unclear/low]: Send a CDP command over the WebSocket and return a promise resolved with the response, probably via a pending-id map.
- `isContextTransition` [unclear/low]: Predicate that detects errors or events indicating a browser execution-context transition or navigation, so evaluate can retry.
- `evaluate` [unclear/low]: Run a JS expression in the browser page via CDP Runtime.evaluate and return the value, probably with retry on context transitions.
- `retainAppLogTail` [unclear/low]: Append app stdout/stderr data to the in-memory appLogTail buffer, keeping only a bounded recent window.

### `server/lib/stripeClient.ts`

Centralized Stripe SDK access for the server: selects the environment-appropriate Stripe secret/publishable keys, validates credential strings, offers a lazily-initialized and cached Stripe client that fails with a 503-style error when billing is unconfigured, and builds a Stripe client that can route through an HTTPS proxy while locking the destination to api.stripe.com and using Bearer auth.

- `getStripeSecretKey` [complete/high]: Return the one Stripe secret key appropriate to the current runtime (production vs non-production) by delegating to the shared selector.
- `getStripePublishableKey` [complete/high]: Return the Stripe publishable key for the current runtime, safe to expose to the browser.
- `hasStripeCredential` [complete/high]: Type guard checking that a value is a usable credential string: non-empty, no leading/trailing whitespace, no CR/LF. Deliberately does not check key prefix.
- `StripeUnavailableError` [complete/high]: Error type signaling that Stripe/billing is not configured, carrying HTTP 503 status for handlers to map.
- `lazyStripeClient` [complete/high]: Return a getter that builds the Stripe client only when first needed, so importing billing services doesn't require Stripe credentials; caches the client and rebuilds it if the credential changes.
- `createStripeClient` [complete/high]: Construct a Stripe client; when HTTPS_PROXY is set, route via the proxy with a custom http client that restricts requests to https://api.stripe.com:443 and sets Bearer authorization.

### `server/services/backup/postgresTools.ts`

Helpers for the backup/restore system that safely locate and choose compatible PostgreSQL client binaries (pg_dump, psql). They convert a DB URL into libpq environment variables so credentials stay off the command line, discover candidate binaries on PATH, and probe their versions. They ask the server for its major version via `SHOW server_version_num`, pick a client whose major is at least the server's, and read the source version from a dump header to guard against restoring into an older server.

- `postgresConnectionEnvironment` [complete/high]: Convert a postgres:// or postgresql:// URI into libpq PG* environment variables, so credentials and connection settings are passed through env rather than argv. Only whitelisted query parameters are accepted.
- `safePostgresDiagnostic` [complete/high]: Turn an error or value into a short message that is safe to log or surface, redacting embedded database URLs and password assignments.
- `runBounded` [complete/high]: Spawn a child process with a hard timeout and a cap on combined stdout/stderr size, resolving with exit code and captured output. It is used for short diagnostic commands (--version, SHOW server_version_num).
- `runBounded.collect` [complete/high]: Inner closure that appends a stdout/stderr chunk to its buffer. It aborts the child and rejects if cumulative output exceeds MAX_OUTPUT_BYTES.
- `parsePostgresClientVersion` [complete/high]: Extract the major and full version from `pg_dump --version` or `psql --version` output.
- `parseServerMajor` [complete/high]: Convert the output of `SHOW server_version_num` (e.g. 160002) into a major version number.
- `installedCandidates` [complete/high]: Discover distinct executable paths for a tool by scanning the PATH directories, resolving symlinks and de-duplicating, with limits to bound the work.
- `probePostgresTools` [complete/high]: Find all installed candidates for a tool and run `--version` on each, returning those that respond with a parseable version.
- `queryServerMajor` [complete/high]: Ask a PostgreSQL server for its major version by running `SHOW server_version_num` with a specific psql binary.
- `serverMajorWithAvailablePsql` [complete/high]: Determine the server major version by trying the available psql clients from highest major to lowest until one succeeds. It also returns the probed psql list.
- `compatibleTool` [complete/high]: Choose a client tool compatible with the server: major >= server major, preferring an exact match, otherwise the smallest higher major.
- `selectPgDumpForServer` [complete/high]: Pick a pg_dump binary compatible with the source server, whose major is detected via psql.
- `selectPsqlForRestore` [complete/high]: Pick a psql binary to restore a dump into a target, refusing if the target server is older than the server the dump came from.
- `dumpedServerMajor` [complete/high]: Return the numeric major version of the server that produced a plain-SQL dump.
- `dumpedServerVersion` [complete/high]: Parse the '-- Dumped from database version X[.Y]' header comment from the first 8 KiB of a dump.

### `server/services/safeUrlFetch.ts`

Shared SSRF-safe outbound HTTP(S) fetch utility. It validates URLs, blocks private/reserved IPs (including at connect time through a custom DNS lookup on http/https Agents, which closes DNS-rebinding gaps), re-validates redirect hops, and bounds time, size and redirects. Exposes text and buffer fetchers for any code fetching attacker-influenced URLs.

- `isReservedIp` [complete/high]: Decide whether an IP literal (or 'localhost') is private, loopback, link-local, CGNAT, reserved, documentation or transition-range, and so unsafe to fetch. Fails closed on unparseable or non-global-unicast IPv6.
- `assertPublicHttpUrl` [complete/high]: Pre-flight validation that a string is a well-formed public http(s) URL without credentials and with a non-local, non-reserved literal host. Returns the parsed URL.
- `safeFetchText` [complete/high]: Fetch a public URL and return its body decoded as UTF-8 text, with SSRF, redirect, size and time bounds. Non-2xx responses are returned rather than thrown.
- `safeFetchBuffer` [complete/high]: Core SSRF-hardened GET returning raw bytes. Validates the URL, applies an optional host allowlist, and uses guarded agents with no proxy, a timeout, a size cap, at most 3 redirects, and per-redirect re-validation.
