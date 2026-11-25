# Intent map

Generated: 2026-11-25T01:46:30.866567+00:00

## Architecture

Max Booster is a TypeScript monorepo (Express API server on Replit with Neon Postgres, React/Vite client, shared schema) layered on top of an in-repo 'MaxCore' AI subsystem (Python training server, software 'digital GPU', Node-Python analysis bridge) and a PDIM cache/state layer. The server holds services for multimodal generation, voice, audio, video, social sync, Stripe billing, and backup/restore. Client code provides admin consoles, settings feedback, batch/bulk action hooks, a11y helpers, WebSocket and template hooks, and a browser video renderer. A large set of Node .mjs scripts under script/ and scripts/ supply deployment gating (executive scheduler, autofix, portable Python), recovery drills, SAST evidence, and sealed readiness/acceptance harnesses. This synthesis is based on module-level summaries only; no function bodies were inspected, so statuses are inferred from module descriptions.

## Features

- **MaxCore AI video generation and rendering** [complete]: The server orchestrates hook/body/CTA and sentiment generation, submits a MaxCore video job and polls for the result. Because the server's video URL is 404, the browser renders a five-scene timeline onto a Canvas. TemplateCompiler turns promo templates into a renderer-ready VideoProject. (AI enhancements/advancedVideoRendererService.ts, client/src/lib/video/maxcoreVideoRenderer.ts, client/src/lib/video/TemplateCompiler.ts)
- **Multimodal, voice and audio generation** [complete]: Planning and execution of text, image, audio and video workflows per platform. TTS is only available through MaxCore and throws AIUnavailableError when MaxCore is down. FFmpeg builds procedural genre music beds, optionally mixed with a voiceover. (server/services/multimodalGenerationService.ts, server/services/voiceSynthesisService.ts, server/services/audioGeneratorService.ts, scripts/testing/generation-reliability-gate.mjs)
- **MaxCore remote control and admin console** [complete]: An admin-only router forwards control, status, logs, training, model, dataset and knowledge calls to the MaxCore peer. The React cognitive console and training dashboard consume these endpoints. (server/routes/maxcore.ts, client/src/components/admin/MaxCoreCognitiveConsole.tsx, external/maxcore/artifacts/ai-dashboard/src/pages/training.tsx)
- **Digital GPU software compute domain** [partial]: A numpy emulation of the CUDA execution model plus an abstract Backend interface. Cluster and ASIC backends are honest non-functional plug-points that raise NotImplementedError. (external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py, external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py, external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py)
- **AI director analytics feedback loop** [complete]: Records engagement performance of deployed content via pluggable JSONL and PDIM backends. (external/maxcore/artifacts/ai-training-server/ai_model/director/analytics.py)
- **Batch and bulk action hooks** [complete]: Several overlapping hooks post ID lists to /api/batch/{resource}/{action}, managing confirm/processing/result state, with a progress state-machine hook. The four hook files duplicate each other's functionality. (client/src/hooks/useBatchAction.ts, client/src/hooks/useBatchActions.ts, client/src/hooks/useBatchProgress.ts, client/src/hooks/useBulkAction.ts)
- **Client UX infrastructure** [complete]: Settings outcome feedback, module keyboard shortcuts, studio template CRUD hook, a WebSocket hook with bounded reconnect, and accessibility focus and keyboard helpers. (client/src/components/settings/SettingsOutcomeHandler.tsx, client/src/hooks/useModuleShortcuts.ts, client/src/hooks/useTemplate.ts, client/src/hooks/useWebSocket.ts, client/src/lib/a11y/focus.ts, client/src/lib/a11y/keyboard.ts)
- **Server infrastructure utilities** [complete]: A dependency-free cron scheduler with timezone support, a Stripe client helper, a two-tier L1/PDIM API cache, an SSRF-safe fetch, push notification payload builders and social platform stat sync. (server/lib/cronScheduler.ts, server/lib/stripeClient.ts, server/middleware/apiCache.ts, server/services/safeUrlFetch.ts, server/services/pushNotificationTypes.ts, server/services/socialSyncService.ts)
- **Database backup, restore and recovery drill** [complete]: pg_dump and psql wrappers with size, time and version checks, a PostgreSQL client binary locator, and a live disaster-recovery drill from a snapshot of the Neon primary. (server/services/backup/databaseDump.ts, server/services/backup/databaseRestore.ts, server/services/backup/postgresTools.ts, scripts/database-recovery-drill.mjs)
- **Deployment gating and orchestration** [complete]: A fail-closed autofix gate (ESLint, typecheck, fix-all), a dependency- and resource-aware process scheduler, portable Python provisioning, and archival of the August 2026 production variants. (scripts/deployment-autofix.mjs, script/deployment/executive.mjs, script/lib/provisionPortablePython.mjs, scripts/archive-august-production-variants.mjs)
- **Readiness, acceptance and security evidence harnesses** [complete]: Sealed, isolated rehearsal and acceptance scripts using ephemeral Postgres and cleared environments, a Semgrep SAST evidence generator, a data-runtime boundary test, a native-analysis bridge verifier and a CDP browser driver. (scripts/readiness-assembled-acceptance.mjs, scripts/readiness-beta-simulation.mjs, scripts/readiness-isolated-rehearsal.mjs, scripts/readiness-packed-acceptance.mjs, scripts/readiness-sast-scan.mjs, scripts/test-data-runtime.mjs, scripts/testing/page80-acceptance.mjs, scripts/verify-native-analysis.ts, scripts/maxcore-eval-browser.mjs)
- **Patent application PDF generation** [complete]: A one-shot pdfkit script that generates a formatted US patent application PDF for the PDIM system. (external/pdim/scripts/src/generate-patent.ts)

## Unfinished work

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend._nyi` [medium]: body is not_implemented
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend` [high]: model assessed as stub | missing: Real device implementations in concrete subclasses. The stub status is intentional, per the module docstring.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.create_tensor` [high]: model assessed as stub | missing: Backend-specific tensor allocation.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.gemm` [high]: model assessed as stub | missing: GEMM implementation.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.add` [high]: model assessed as stub | missing: Add implementation.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.relu` [high]: model assessed as stub | missing: ReLU implementation.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.softmax` [high]: model assessed as stub | missing: Softmax implementation.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.attention` [high]: model assessed as stub | missing: Attention implementation.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.conv2d` [high]: model assessed as stub | missing: conv2d implementation.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.mlp` [high]: model assessed as stub | missing: MLP implementation.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `_FutureBackend.reduce` [high]: model assessed as stub | missing: Reduce implementation.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `ClusterBackend` [high]: model assessed as stub | missing: RPC layer, graph partitioning, KV-cache sharding, all-reduce at barriers, and local device backends per shard.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `ASICBackend` [high]: model assessed as stub | missing: IR-to-microcode lowering, DMA control, on-chip KV-cache and tensor-unit drivers.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` `<module-level>` [low]: docs claim: The `.cu` kernel files are the contract and the Python layer runs CUDA-written kernels without GPU hardware | missing: The `.cu` kernel files are the contract and the Python layer runs CUDA-written kernels without GPU hardware
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.create_tensor` [high]: model assessed as stub | missing: Nothing expected, as an abstract interface method; the body is `...` by design and implementations live in subclasses.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.gemm` [high]: model assessed as stub | missing: Abstract by design; concrete implementations are in subclasses.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.add` [high]: model assessed as stub | missing: Abstract by design.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.relu` [high]: model assessed as stub | missing: Abstract by design.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.softmax` [high]: model assessed as stub | missing: Abstract by design.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.attention` [high]: model assessed as stub | missing: Abstract by design.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.conv2d` [high]: model assessed as stub | missing: Abstract by design.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.mlp` [medium]: model assessed as stub | missing: Abstract by design.
- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` `Backend.reduce` [high]: model assessed as stub | missing: Abstract by design.
- `client/src/hooks/useBatchAction.ts` `useBatchAction` [medium]: body is empty; model assessed as partial | missing: (1) retryFailed relies on pendingConfig, but execute() clears it on success and direct execute() calls never set it, so retry is effectively unreachable. (2) cancel() aborts an AbortController whose signal is never passed to apiRequest, so cancellation does not stop the request. A later response can still overwrite the 'cancelled' status. (3) The interval is not cleaned up on unmount. (4) Nothing consumes pendingConfig after confirm(); the caller must call execute itself.
- `client/src/hooks/useBatchAction.ts` `useDistributionBatchActions` [medium]: body is empty
- `client/src/hooks/useBatchAction.ts` `useSocialBatchActions` [medium]: body is empty
- `client/src/hooks/useBatchAction.ts` `useMarketplaceBatchActions` [medium]: body is empty
- `client/src/hooks/useBatchAction.ts` `useFileBatchActions` [medium]: body is empty
- `client/src/hooks/useBatchAction.ts` `useAnalyticsBatchActions` [medium]: body is empty
- `client/src/hooks/useBatchActions.ts` `useBatchActions` [medium]: body is empty; model assessed as partial | missing: Several defects. (1) In the useJobProgress path, execute returns right after starting the poll interval (pollJobProgress does not await completion). It never calls onSuccess, shows no toast and does no query invalidation when the job finishes. (2) retryFailed is effectively dead, because pendingConfig is only set by confirm() and is cleared at the end of execute(). (3) cancel() aborts an AbortController whose signal is never passed to apiRequest, so the request is not actually cancelled. (4) The poll and simulation intervals are not cleared on unmount. (5) The parser requires success+failed == ids.length, which looks inconsistent with an asynchronous job response. (6) With empty ids, the simulation computes total-1 = -1.
- `client/src/hooks/useBatchActions.ts` `useReleaseBatchActions` [medium]: body is empty
- `client/src/hooks/useBatchActions.ts` `useTrackBatchActions` [medium]: body is empty
- `client/src/hooks/useBatchActions.ts` `usePostBatchActions` [medium]: body is empty
- `client/src/hooks/useBatchActions.ts` `useBeatBatchActions` [medium]: body is empty
- `client/src/hooks/useBatchActions.ts` `useAnalyticsBatchActions` [medium]: body is empty
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
- `client/src/hooks/useBulkAction.ts` `useBulkAction` [medium]: body is empty; model assessed as partial | missing: The AbortController is created but its signal is never passed to apiRequest, so cancel() cannot abort the request. Progress is not incremental. confirmMessage is carried in config but never used by the hook. Failed-status results do not call onError.
- `client/src/hooks/useBulkAction.ts` `useBulkDelete` [medium]: body is empty
- `client/src/hooks/useBulkAction.ts` `useBulkUpdate` [medium]: body is empty
- `client/src/hooks/useBulkAction.ts` `useBulkExport` [medium]: body is empty; model assessed as partial | missing: No handling of a downloadable file or export payload. The result only reports per-id success or failure, so it is unclear how the user gets the exported data.
- `client/src/hooks/useBulkAction.ts` `useBulkStatusChange` [medium]: body is empty
- `client/src/hooks/useModuleShortcuts.ts` `useStudioShortcuts` [medium]: body is empty; model assessed as partial | missing: Default shortcut handlers are no-ops. Callers must supply handlers, and none currently do. Handler identity is unstable, so shortcuts are re-registered every render.
- `client/src/hooks/useModuleShortcuts.ts` `useAnalyticsShortcuts` [medium]: body is empty; model assessed as partial | missing: Default handlers are no-ops. No callers were found, so it is unused or unwired.
- `client/src/hooks/useModuleShortcuts.ts` `useSocialShortcuts` [medium]: body is empty; model assessed as partial | missing: Default handlers are no-ops. No callers were found, so it is unused or unwired.
- `client/src/hooks/useModuleShortcuts.ts` `useDistributionShortcuts` [medium]: body is empty; model assessed as partial | missing: Default handlers are no-ops. No callers were found, so it is unused or unwired.
- `client/src/hooks/useModuleShortcuts.ts` `useMarketplaceShortcuts` [medium]: body is empty; model assessed as partial | missing: Default handlers are no-ops. No callers were found, so it is unused or unwired.
- `scripts/test-data-runtime.mjs` `newBullMQRedisConnection` [medium]: body is empty; model assessed as stub | missing: Intentionally minimal mock.
- `scripts/test-data-runtime.mjs` `flushFeatureEvents` [medium]: body is empty; model assessed as stub | missing: Intentionally empty mock.
- `scripts/test-data-runtime.mjs` `encode` [medium]: body is empty; model assessed as stub | missing: Intentionally empty mock.
- `scripts/test-data-runtime.mjs` `decode` [medium]: body is empty; model assessed as stub | missing: Intentionally empty mock.
- `scripts/test-data-runtime.mjs` `safePostgresDiagnostic` [medium]: model assessed as stub | missing: Real redaction logic is not mocked, and the test does not need it.
- `client/src/lib/a11y/focus.ts` `createFocusIndicatorStyles` [medium]: body is empty
- `client/src/lib/a11y/focus.ts` `applyFocusIndicator` [medium]: body is empty
- `client/src/lib/a11y/focus.ts` `isElementFocusable` [medium]: model assessed as partial | missing: Handling for contenteditable, hidden inputs, inert and hidden ancestors, and programmatic focusability.
- `client/src/lib/a11y/focus.ts` `createFocusScope` [medium]: model assessed as partial | missing: Idempotent lock, moving focus into the container, and handling of elements added after lock().
- `client/src/lib/video/maxcoreVideoRenderer.ts` `renderMaxcoreVideo` [medium]: body is empty
- `client/src/lib/video/maxcoreVideoRenderer.ts` `drawText` [medium]: model assessed as partial | missing: Default line height is computed from a font string that starts with the weight, so it is NaN. The callers shown never use the returned y.
- `client/src/lib/video/maxcoreVideoRenderer.ts` `drawHookScene` [medium]: model assessed as partial | missing: The underline width is measured after restore, so the hook font is no longer set.
- `client/src/lib/video/maxcoreVideoRenderer.ts` `drawCtaScene` [high]: model assessed as partial | missing: `meta.hashtags.slice(0,5) || []` throws TypeError when hashtags is undefined (the field is optional). It should be `(meta.hashtags || []).slice(0,5)`.
- `scripts/simulate-production.mjs` `requestOnAgent` [medium]: body is empty
- `scripts/simulate-production.mjs` `buildEnv` [medium]: body is empty
- `scripts/simulate-production.mjs` `runProcess` [medium]: body is empty
- `scripts/simulate-production.mjs` `request` [medium]: body is empty
- `client/src/lib/video/TemplateCompiler.ts` `compileTemplate` [medium]: body is empty; model assessed as partial | missing: CompilerOptions fields optimizeForExport, generateThumbnail and audioAnalysis are never read.
- `client/src/lib/video/TemplateCompiler.ts` `createVideoProjectFromTemplate` [medium]: body is empty
- `client/src/lib/video/TemplateCompiler.ts` `scaleLayerConfig` [medium]: model assessed as partial | missing: No copy of the config before mutation. Other size fields (strokeWidth, maxWidth, emissionArea) are not scaled.
- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py` `CUDARuntime.syncthreads` [medium]: body is pass; model assessed as stub | missing: Nothing is needed under the current model. Real barrier semantics would be required if threads were ever simulated individually.
- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py` `WarpState` [medium]: model assessed as partial | missing: The stored lane state (_vals, load) is not used by the primitives. The primitives are stateless.
- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py` `WarpState.shfl_down_sync` [high]: model assessed as partial | missing: Pure shuffle semantics (returning the neighbour's value without adding) are not provided. The mask is ignored.
- `server/lib/stripeClient.ts` `lazyStripeClient` [medium]: body is empty
- `server/lib/stripeClient.ts` `createStripeClient` [medium]: body is empty
- `server/lib/stripeClient.ts` `<module-level>` [low]: docs claim: Distribution to streaming platforms, storefront/marketplace and royalty payouts are advertised as core platform features | missing: Distribution to streaming platforms, storefront/marketplace and royalty payouts are advertised as core platform features
- `server/services/backup/postgresTools.ts` `probePostgresTools` [medium]: body is empty
- `server/services/backup/postgresTools.ts` `selectPgDumpForServer` [medium]: body is empty
- `server/services/backup/postgresTools.ts` `selectPsqlForRestore` [medium]: body is empty
- `.pdim-cluster-test-Pidv4k/cluster-fixture.mjs` `computeWorkerSizing` [medium]: body is empty
- `.pdim-cluster-test-Pidv4k/cluster-fixture.mjs` `unsubscribe` [medium]: body is empty
- `AI enhancements/advancedVideoRendererService.ts` `compositeTextOnLocalVideo` [medium]: body is empty
- `AI enhancements/advancedVideoRendererService.ts` `compositeTextOnMaxcoreVideo` [medium]: body is empty
- `client/src/components/settings/SettingsOutcomeHandler.tsx` `useLoadingState` [medium]: body is empty
- `client/src/components/settings/SettingsOutcomeHandler.tsx` `useFormValidation` [medium]: model assessed as partial | missing: Validators never remove a field's earlier error from state when the new value is valid, so a stale error stays in `errors` until clearError is called. Error messages say 'less than 30/500 characters' while the checks allow exactly 30/500. The website regex is restrictive (TLD of 2-6 letters, no localhost, no query strings or ports). Password validation is absent even though password outcomes exist.
- `client/src/hooks/useBatchProgress.ts` `useBatchProgress` [medium]: body is empty; model assessed as partial | missing: `autoStart` is declared in the options but never used. `options.jobId` is read only as the initial state, so later changes are ignored. The 100ms 'starting' to 'processing' timeout is never cleared on reset, cancel or unmount. onProgress and onComplete are called inside setState updater functions, which are impure and double-invoked under StrictMode. cancel() does not tell the server to cancel the job.
- `client/src/hooks/useBatchProgress.ts` `useBatchProgressDialog` [medium]: model assessed as partial | missing: The result `success` list is never populated, because the hook does not track succeeded ids. The `onComplete: () => {}` option is a no-op. The `progress` object is recreated every render, so the useCallback dependencies on it are ineffective.
- `client/src/hooks/useTemplate.ts` `useTemplate` [medium]: body is empty
- `client/src/hooks/useTemplate.ts` `<module-level>` [low]: docs claim: Max Booster is described as an all-in-one 'AI-assisted music creation and studio tools' platform | missing: Max Booster is described as an all-in-one 'AI-assisted music creation and studio tools' platform
- `client/src/lib/a11y/keyboard.ts` `createFocusTrap` [medium]: body is empty
- `client/src/lib/a11y/keyboard.ts` `createRovingTabIndex` [medium]: body is empty; model assessed as partial | missing: currentIndex is not synced when items receive focus by click or Tab. Newly added items are not given a tabindex until a key is pressed. Grid up/down wraps linearly rather than by column. Home/End are handled for every orientation.
- `external/maxcore/artifacts/ai-training-server/ai_model/director/analytics.py` `AnalyticsSource.get_recent` [medium]: body is ellipsis
- `external/maxcore/artifacts/ai-training-server/ai_model/director/analytics.py` `AnalyticsSource.record` [medium]: body is ellipsis
- `external/pdim/scripts/src/generate-patent.ts` `body` [medium]: body is empty
- `external/pdim/scripts/src/generate-patent.ts` `addPageNumber` [medium]: model assessed as partial | missing: The PDFDocument is constructed without bufferPages:true, so switchToPage may throw or fail to work. Enabling buffering would be needed to reliably stamp page numbers.
- `script/deployment/executive.mjs` `notify` [medium]: body is empty
- `script/deployment/executive.mjs` `unbind` [medium]: body is empty
- `script/lib/provisionPortablePython.mjs` `command` [medium]: body is empty
- `script/lib/provisionPortablePython.mjs` `provisionPortablePython` [medium]: body is empty
- `scripts/archive-august-production-variants.mjs` `runGit` [medium]: body is empty
- `scripts/archive-august-production-variants.mjs` `hasEmbeddedSecret` [medium]: model assessed as partial | missing: The non-global regexes via text.match only inspect the first match per pattern. A harmless first match (for example an env reference) can hide a later real secret. Token formats not tied to a sensitive variable name are not detected.
- `scripts/database-recovery-drill.mjs` `run` [medium]: body is empty
- `scripts/database-recovery-drill.mjs` `escapeRegExp` [medium]: body is empty
- `scripts/readiness-assembled-acceptance.mjs` `request` [medium]: body is empty
- `scripts/readiness-assembled-acceptance.mjs` `authRequest` [medium]: body is empty
- `scripts/testing/page80-acceptance.mjs` `request` [medium]: body is empty
- `scripts/testing/page80-acceptance.mjs` `authRequest` [medium]: body is empty
- `server/lib/cronScheduler.ts` `schedule` [medium]: body is empty
- `server/lib/cronScheduler.ts` `nextExecution` [medium]: model assessed as partial | missing: Standard dom/dow semantics (use AND/restrict when either field is `*`). Skip-ahead logic that realigns to period boundaries instead of adding fixed offsets from a misaligned minute. The skips can overshoot: the 28-day month skip can jump over days of a matching month, and the day and hour skips from a non-aligned minute can miss early matching minutes, e.g. '0 11 * * *' evaluated at 10:30 can miss 11:00. Whether the day and hour skips actually overshoot is my reading of the code and no test is shown.
- `server/routes/maxcore.ts` `pdimRpc` [medium]: body is empty
- `server/routes/maxcore.ts` `<module-level>` [low]: docs claim: MaxCore defaults to MAXCORE_SERVING_RELEASE=live-awareness and learns continuously (README text truncated) | missing: MaxCore defaults to MAXCORE_SERVING_RELEASE=live-awareness and learns continuously (README text truncated)
- `server/services/safeUrlFetch.ts` `safeFetchText` [medium]: body is empty
- `server/services/safeUrlFetch.ts` `safeFetchBuffer` [medium]: body is empty
- `server/services/socialSyncService.ts` `refreshOAuth2Token` [medium]: body is empty
- `server/services/socialSyncService.ts` `getValidAccessToken` [medium]: model assessed as partial | missing: The Facebook/Instagram exchange is unreachable when no refresh_token is stored, because the early return at the `!connection?.refreshToken` check precedes it, and those platforms typically have none. The comment 'clear any needsReconnect flag' is not implemented, since the success update never touches metadata. The plain 'google' platform has no refresh branch. The `[0].metadata` lookup throws if the row is missing, though the surrounding try/catch swallows it.
- `server/services/voiceSynthesisService.ts` `synthesizeVoice` [medium]: body is empty; model assessed as partial | missing: reverbAmount, referenceAudioPath and local maxDurationSeconds truncation are not applied. The header's FFmpeg post-processing (format/loudness) is not implemented. The profile DSP params are not used. The file extension is assumed to match the requested format and mcAudio.format is ignored. The inventory's 'stub=empty' flag reflects only the signature lines; the body is real.
- `server/services/voiceSynthesisService.ts` `synthesizeSegments` [high]: model assessed as partial | missing: Bug: with exactly one segment it returns segPaths[0], which is also in tempFiles, so the finally block deletes the file it returned. Segments are mp3 when outputFormat is 'mp3' but pauses are 44.1kHz stereo WAV, and the concat demuxer with mixed codecs/sample rates is unreliable. Paths in the concat list are not quote-escaped. durationSeconds is not reported. The docstring promises 'cross-fading' but only hard concatenation is done. The excessive `?.` usage is noise.
- `client/src/components/a11y/FocusTrap.tsx` `useFocusTrapHook` [medium]: body is empty
- `client/src/components/a11y/LiveRegion.tsx` `useLiveRegion` [medium]: body is empty
- `client/src/components/a11y/ReducedMotionWrapper.tsx` `useMotionSafeStyles` [medium]: body is empty
- `client/src/components/admin/MaxCoreCognitiveConsole.tsx` `apiResult` [medium]: body is empty
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
- `client/src/hooks/useUndoStack.ts` `useUndoStack` [medium]: body is empty
- `client/src/hooks/useWebSocket.ts` `useWebSocket` [medium]: body is empty; model assessed as partial | missing: The effect has an empty dependency array, so callbacks captured at mount go stale. The userId option is unused. A manual disconnect() does not stop the onclose handler from scheduling a reconnect, because onclose still fires and attempts remain. No backoff. connect has no error callback in its catch block. Unmounting also triggers onclose, which can set state and reconnect after unmount.
- `client/src/lib/video/RenderOrchestrator.ts` `createOrchestrator` [medium]: body is empty
- `docs/archive/production-variants-2026-08/history/scripts-and-config/scripts/deployment-autofix.mjs/deployment-autofix--54df3b7864e9.mjs` `run` [medium]: body is empty
- `docs/archive/production-variants-2026-08/history/scripts-and-config/scripts/deployment-autofix.mjs/deployment-autofix--7efb934770bc.mjs` `run` [medium]: body is empty
- `external/maxcore/artifacts/ai-dashboard/src/pages/training.tsx` `apiFetch` [medium]: body is empty
- `external/pdim/.replit_integration_files/client/src/hooks/use-upload.ts` `useUpload` [medium]: body is empty
- `script/lib/portablePython.mjs` `runPortablePython` [medium]: body is empty
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
- `server/lib/localPdimServer.ts` `unsubscribe` [medium]: body is empty
- `server/middleware/apiCache.ts` `cacheMiddleware` [medium]: body is empty
- `server/middleware/idempotency.ts` `idempotencyMiddleware` [medium]: body is empty
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

## Claims in the docs with no matching implementation

- Distribution to streaming platforms, storefront/marketplace and royalty payouts are advertised as core platform features (evidence: None of the modules in this synthesis implement distribution, marketplace or payout logic beyond Stripe client helpers and push-notification types, so they cannot be confirmed from this subset.; suggested file: server/lib/stripeClient.ts)
- The `.cu` kernel files are the contract and the Python layer runs CUDA-written kernels without GPU hardware (evidence: The CUDA runtime is a numpy emulation, while the cluster and ASIC backends in future_backends.py raise NotImplementedError. Only the CPU/numpy path is evident.; suggested file: external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py)
- The Neon TLS WebSocket bridge preserves transactions for the imported MaxCore clients (evidence: No bridge implementation appears in the listed modules, so this README claim is unverified here.; suggested file: unknown)
- MaxCore defaults to MAXCORE_SERVING_RELEASE=live-awareness and learns continuously (README text truncated) (evidence: The README is cut off mid-sentence. The modules listed show training controls and continuous-training UI but no serving-release selection logic.; suggested file: server/routes/maxcore.ts)
- Max Booster is described as an all-in-one 'AI-assisted music creation and studio tools' platform (evidence: Only a studio template hook and the audio generator appear in this subset. No DAW or studio engine modules are covered (the dependency list mentions plugins such as @plugins/ReverbPlugin).; suggested file: client/src/hooks/useTemplate.ts)

## Third-party dependencies

- `fitz`: 1 file(s), surface ['Matrix', 'open']: eligible
- `${_msgpackrUrl}`: 17 file(s), surface unknown: used in 17 files (> 10)
- `${_wasmoonUrl}`: 17 file(s), surface unknown: used in 17 files (> 10)
- `@google-cloud/storage`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `msgpackr`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `pino`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `wasmoon`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@/components`: 643 file(s), surface unknown: used in 643 files (> 10)
- `@/hooks`: 350 file(s), surface unknown: used in 350 files (> 10)
- `@/lib`: 795 file(s), surface unknown: used in 795 files (> 10)
- `lucide-react`: 663 file(s), surface unknown: used in 663 files (> 10)
- `react`: 915 file(s), surface unknown: used in 915 files (> 10)
- `wouter`: 100 file(s), surface unknown: used in 100 files (> 10)
- `@tanstack/react-query`: 268 file(s), surface unknown: used in 268 files (> 10)
- `sharp`: 10 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@shared/schema`: 211 file(s), surface unknown: used in 211 files (> 10)
- `drizzle-orm`: 285 file(s), surface unknown: used in 285 files (> 10)
- `express`: 233 file(s), surface unknown: used in 233 files (> 10)
- `zod`: 94 file(s), surface unknown: used in 94 files (> 10)
- ` + typeOnly + clauseBits.join(`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `typescript`: 27 file(s), surface unknown: used in 27 files (> 10)
- `fast-xml-parser`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `model`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `router`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `axum`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `boosterstate`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `serde`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `tokio`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `tower_http`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@capacitor/cli`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@/contexts`: 40 file(s), surface unknown: used in 40 files (> 10)
- `@/pages`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@shared/adminAccessPolicy.mjs`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `worker-timers`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `react-i18next`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@uppy/aws-s3`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@uppy/core`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@uppy/dashboard`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@uppy/react`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `framer-motion`: 141 file(s), surface unknown: used in 141 files (> 10)
- `recharts`: 19 file(s), surface unknown: used in 19 files (> 10)
- `@shared/types`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `date-fns`: 41 file(s), surface unknown: used in 41 files (> 10)
- `@dnd-kit/core`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@dnd-kit/sortable`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@dnd-kit/utilities`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@shared/passwordPolicy`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `qrcode`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@hookform/resolvers`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `react-hook-form`: 9 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@shared/domainValidation`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@tanstack/react-query-persist-client`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `react-dom`: 10 file(s), surface unknown: automatic replacement is only supported for Python projects
- `canvas-confetti`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@shared/apiKeyScopes`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@icons-pack/react-simple-icons`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@/stores`: 9 file(s), surface unknown: automatic replacement is only supported for Python projects
- `mediasoup-client`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `tone`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `pixi.js`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `reactflow`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `zustand`: 7 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-accordion`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-alert-dialog`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `class-variance-authority`: 69 file(s), surface unknown: security-sensitive (crypto/auth/TLS): never rebuilt in-house automatically
- `@radix-ui/react-aspect-ratio`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-avatar`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-slot`: 28 file(s), surface unknown: used in 28 files (> 10)
- `react-day-picker`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `embla-carousel-react`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-checkbox`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-collapsible`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-dialog`: 15 file(s), surface unknown: used in 15 files (> 10)
- `cmdk`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-context-menu`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-dropdown-menu`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-toast`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-label`: 9 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-popover`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-radio-group`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-scroll-area`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-select`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-separator`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-slider`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-switch`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-tabs`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-toggle-group`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-toggle`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-tooltip`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `yjs`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `nanoid`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@/audio`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `i18next`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `i18next-browser-languagedetector`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/BasePlugin`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/ChorusPlugin`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/CompressorPlugin`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/DeEsserPlugin`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/DelayPlugin`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/DistortionPlugin`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/DynamicEQPlugin`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/EQPlugin`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/FlangerPlugin`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/PhaserPlugin`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/ReverbPlugin`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@plugins/VocoderPlugin`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `idb`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `web-vitals`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `clsx`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `tailwind-merge`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@sentry/react`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@/data`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `jspdf`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `jspdf-autotable`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `howler`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@shared/agePolicy`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@stripe/react-stripe-js`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@stripe/stripe-js`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `maxmind`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `dotenv`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `pg`: 24 file(s), surface unknown: used in 24 files (> 10)
- `fastify`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `github.com/miekg/dns`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `github.com/jackc/pgx/v5/pgxpool`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `esbuild`: 31 file(s), surface unknown: used in 31 files (> 10)
- `drizzle-kit`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `electron`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@eslint/js`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@typescript-eslint/eslint-plugin`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@typescript-eslint/parser`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `eslint-plugin-react-hooks`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `vaul`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-hover-card`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `input-otp`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-menubar`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-navigation-menu`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@radix-ui/react-progress`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `react-resizable-panels`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `next-themes`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `sonner`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@workspace/api-client-react`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@replit/vite-plugin-cartographer`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@replit/vite-plugin-dev-banner`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@replit/vite-plugin-runtime-error-modal`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@tailwindcss/vite`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@vitejs/plugin-react`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `vite`: 27 file(s), surface unknown: used in 27 files (> 10)
- `ai_model`: 113 file(s), surface ['AcceleratedTransformerLM', 'AssetIndex', 'AttentionTile', 'AwarenessUnavailable', 'BLOB', 'BPETokenizer', 'Blocked', 'CANDIDATES', 'CAPABILITY_POLICY', 'COLOR_SCHEMES', 'CONTROL_TOKENS', 'CUDANvcc', 'CUDARuntime', 'CandidateByteTokenizer', 'CandidateModel', 'CandidateTrainingBackend', 'CandidateTransformer', 'ComputeTile', 'CoverageAlert', 'CoverageWatchdog', 'CreativeDataset', 'CreativeModel', 'DOMAINS', 'DigitalGPU', 'DigitalGPUBackend', 'Dim3', 'EMBED_DIM', 'Engine', 'FP32', 'GPUCluster', 'GPUError', 'GemmTile', 'GenerateCoalescer', 'GenerationBrief', 'GenerationPlan', 'GlobalMemory', 'HyperCreativeTransformerLM', 'HyperFlashAttention', 'HyperGPU', 'HyperGPUBackend', 'HyperGPULinear', 'HyperLN', 'HyperLayerNorm', 'HyperLinearNL', 'HyperSIMDCore', 'HyperTransformerLM', 'INFERENCE_GATE', 'ImageEngine', 'ImageRequest', 'Instruction', 'InvalidOpcodeError', 'KVCache', 'LEASE_KEY', 'LICENSES', 'LiveModelUnavailable', 'MAX_AUDIO_SAMPLE_FRAMES', 'MAX_SOURCE_IMAGE_PIXELS', 'MAX_VIDEO_PIXEL_FRAMES', 'METRICS', 'MIN_ANCHORS', 'MIXED', 'MaxCoreOp', 'MaxCoreSilicon', 'MediaKernelError', 'MusicalTimeline', 'NEAREST_RADIUS', 'NativeCompiler', 'NativeKernels', 'OBSERVATIONS_PREFIX', 'OOMError', 'OPCODES', 'OWNER_ADMIN_GRANT', 'OpCode', 'OpRecord', 'OpcodeSpec', 'PALETTE_SLICE', 'PDIM', 'PDIMStateStore', 'PEAK_ARCHITECTURE', 'PEAK_POLICY', 'PLATFORMS', 'POINTER', 'PrecisionMode', 'Program', 'PublicContentTransformer', 'REGISTRY', 'ROOT', 'RenderCancelled', 'RequestScopedGPU', 'ResponseTooLarge', 'RetrievedAsset', 'SECRET', 'SIMDCore', 'SafeHTTPError', 'Scheduler', 'ScriptAgent', 'ScriptRequest', 'Section', 'ShapeError', 'ShapeMismatchError', 'SiliconScheduler', 'SimpleTokenizer', 'Snapshot', 'TTL', 'Telemetry', 'TrainConfig', 'TransformerLM', 'TypeErrorGPU', 'UnsupportedContentType', 'Utf8GenerationState', 'VRAM', 'VideoRequest', 'VisualDNA', '_FlashAttention', '_HyperLayerNorm', '_HyperSiLU', '_MixedPrecisionGEMM', '_NOTE_SEMI', '_PinnedHTTPConnection', '_PinnedHTTPSConnection', '_UPLOADS_DIR', '__dict__', '__new__', '_approved_text_training_rights', '_decode_prefix_payload', '_encode_prefix_payload', '_gen_cache', '_gradient_array', '_hyper_core', '_isolated_uploads', '_resolve_local_path', '_script_prompt', '_timestamp', '_to_rgb', '_valid_live_awareness_record', 'active_plan', 'analyze_audio', 'api', 'apply', 'apply_rope', 'apply_rope_offset', 'array', 'asset_pipeline', 'auto_select', 'awareness_from_direction', 'best_genre_hook_style', 'bind', 'body_candidates', 'bound_snapshot', 'bounded_text', 'brief_directives', 'brief_enrichment', 'build_brief', 'build_context', 'build_dna', 'build_manifest', 'candidate_registry', 'canonical', 'capabilities', 'capability_budget_seconds', 'capability_snapshot', 'check_inference_budget', 'choice', 'classify_result', 'commit_artifact', 'compose_caption', 'condition_background', 'conditioning', 'configured_sources', 'conv_wmma_sm102', 'create_candidate_adapter', 'creative_model', 'cta_candidates', 'current_gpu_instance', 'current_snapshot', 'decode_array', 'dedicated', 'dedup_cache', 'derive_palette', 'describe_image', 'detect_intent', 'digest', 'digital_gpu_hpss', 'digital_gpu_stft', 'dimensions', 'editing_pattern', 'eligibility', 'eligible_internal_bundle', 'eligible_records', 'encode_array', 'enforce', 'ensure_context_once', 'execute', 'extract_keywords', 'extract_text_from_item', 'fetch_bytes', 'fetch_to_file', 'finish_audio', 'finite_number', 'flash_attn_sm102', 'format_platform_optimization', 'from_arg', 'from_request', 'generate_synthetic_samples', 'generation_guard', 'genre_hook_candidates', 'get', 'get_asset_index', 'get_coverage_watchdog', 'get_engine', 'get_gpu_attn_calls', 'get_native_kernels', 'get_pocket_accelerator', 'get_safety', 'get_spec', 'graduate_hook', 'graduate_image_headline', 'hook_candidates', 'hyper_gpu_sizing', 'im2col_sm102', 'image_engine', 'image_headline_candidates', 'image_to_vector', 'incr', 'inference_deadline', 'ingest_generated_asset', 'is_enabled', 'landscape_feed', 'launch_kernel', 'legacy', 'load_candidate', 'load_checkpoint_archive', 'load_complete_checkpoint', 'make_default_silicon', 'make_training_record', 'media_gpu', 'mix_voiceover_over_music', 'music_targets', 'normalize', 'normalize_genres', 'normalize_platform', 'parent', 'parse', 'parse_feed_xml', 'peak_stream', 'platform_awareness_string', 'platform_hook_candidates', 'platform_hosts', 'precision', 'precompute_rope_freqs', 'producer_tools', 'profile_sourcing_quality_policy', 'quantize', 'quarantine_checkpoint', 'rank_scene_phrases', 'rank_signals', 'record_probe', 'reduction_current_sm102', 'reduction_redesigned_sm102', 'register', 'reject_semantic_controls', 'remove_private_asset_manifest', 'render_audio', 'render_image', 'render_video', 'request_intelligence', 'require_audio_stream', 'require_context', 'require_peak_training_rights', 'reset', 'rta', 'run_ffmpeg', 'safe_http', 'sample_all_scenes', 'sampling_context', 'sampling_seed', 'scene_phrases', 'search', 'select_representable_probe_prompt', 'selected_eligibility', 'self_sufficiency', 'separate_stems', 'set', 'sha256', 'slot', 'sm102_kernels', 'smoke_records', 'snapshot', 'snapshot_hash', 'sources', 'structure_score', 'summarize_quality_cohort', 'synthesize_voiceover', 'telemetry', 'tensor', 'test_phase4', 'test_pipeline', 'train', 'train_validated', 'training_root', 'validate_peak_record', 'validate_snapshot', 'validate_source_observation_document', 'veo_dna', 'verify_bundle', 'verify_finished_audio', 'verify_text_capability', 'verify_training_record', 'write_stem_wav']: used in 113 files (> 10)
- `storage_client`: 16 file(s), surface ['get_artist_client', 'get_storage']: used in 16 files (> 10)
- `fastapi`: 11 file(s), surface ['APIRouter', 'Body', 'CORSMiddleware', 'Depends', 'FastAPI', 'HTTPException', 'Header', 'JSONResponse', 'PlainTextResponse', 'Query', 'Request', 'Response', 'StreamingResponse']: used in 11 files (> 10)
- `pydantic`: 9 file(s), surface ['BaseModel', 'ConfigDict', 'Field', 'model_validator']: eligible
- `numpy`: 127 file(s), surface ['__version__', 'abs', 'add', 'all', 'allclose', 'any', 'append', 'arange', 'arctan2', 'argmax', 'argmin', 'argsort', 'array', 'array_equal', 'array_split', 'as_strided', 'asarray', 'ascontiguousarray', 'atleast_1d', 'bool_', 'broadcast_shapes', 'broadcast_to', 'ceil', 'clip', 'column_stack', 'concatenate', 'convolve', 'copyto', 'corrcoef', 'correlate', 'cos', 'count_nonzero', 'cross', 'cumprod', 'cumsum', 'diff', 'divide', 'dot', 'dstack', 'dtype', 'einsum', 'empty', 'empty_like', 'errstate', 'exp', 'fft', 'float16', 'float32', 'float64', 'floor', 'frombuffer', 'fromfile', 'full', 'full_like', 'gradient', 'hanning', 'histogram', 'hypot', 'inf', 'int16', 'int32', 'int64', 'int8', 'integer', 'interp', 'isfinite', 'isnan', 'isneginf', 'isposinf', 'issubdtype', 'ix_', 'lib', 'linalg', 'linspace', 'load', 'log', 'log10', 'log2', 'logical_and', 'matmul', 'max', 'maximum', 'mean', 'median', 'meshgrid', 'mgrid', 'min', 'minimum', 'moveaxis', 'multiply', 'nan', 'nan_to_num', 'ndarray', 'ndim', 'newaxis', 'ogrid', 'ones', 'ones_like', 'outer', 'pad', 'partition', 'percentile', 'pi', 'polyfit', 'power', 'prod', 'ptp', 'quantile', 'radians', 'random', 'reciprocal', 'repeat', 'resize', 'roll', 'round', 'savez_compressed', 'searchsorted', 'sign', 'signbit', 'sin', 'split', 'sqrt', 'square', 'squeeze', 'stack', 'std', 'subtract', 'sum', 'swapaxes', 'tan', 'tanh', 'tensordot', 'tile', 'transpose', 'triu', 'uint32', 'uint64', 'uint8', 'unique', 'vstack', 'where', 'zeros', 'zeros_like']: used in 127 files (> 10)
- `librosa`: 3 file(s), surface ['beat', 'ex', 'feature', 'fft_frequencies', 'frames_to_time', 'load', 'onset', 'resample', 'segment', 'stft', 'times_like', 'util']: eligible
- `workers`: 5 file(s), surface ['APPLE_SONGS_URL', 'AlreadySeedingError', 'DEEZER_CHART_URL', 'MASTODON_TRENDS_STATUSES', 'YOUTUBE_FEEDS', '_TIMEOUT', '_fetch', 'fetch_bytes', 'get_flywheel', 'harvest', 'quality_harvester', 'seed']: eligible
- `trusted_http`: 3 file(s), surface ['request', 'validated_origin']: eligible
- `server`: 4 file(s), surface ['AudioMasteringRecommendationRequest', 'HTTPStatusError', 'Response', 'ResponseTooLarge', 'UnsafeURL', '_creative_model', '_hyper_backend', '_init_ai_model', '_model_init_error', '_model_ready', '_tokenizer', '_validate_addresses', 'audio_mastering_recommendation', 'request']: API surface of 14 symbols (> 12): too large to rebuild safely
- `torch`: 47 file(s), surface ['AdamW', 'Conv2d', 'Conv3d', 'ConvTranspose3d', 'CrossEntropyLoss', 'DataLoader', 'Dataset', 'DistributedDataParallel', 'Dropout', 'Embedding', 'GELU', 'Generator', 'GroupNorm', 'Identity', 'LayerNorm', 'Linear', 'Module', 'ModuleList', 'MultiheadAttention', 'Parameter', 'ReduceOp', 'Sequential', 'SiLU', 'Tensor', 'Upsample', '__version__', 'all_reduce', 'amp', 'arange', 'autocast', 'autograd', 'backends', 'bfloat16', 'bmm', 'bool', 'cat', 'channels_last', 'channels_last_3d', 'clamp', 'compile', 'complex128', 'complex64', 'conv2d', 'cos', 'cross_entropy', 'cuda', 'cumprod', 'destroy_process_group', 'device', 'dtype', 'empty', 'exp', 'float16', 'float32', 'float64', 'from_numpy', 'frombuffer', 'full', 'full_like', 'functional', 'get_num_threads', 'get_world_size', 'inference_mode', 'init', 'init_process_group', 'int16', 'int32', 'int64', 'int8', 'interpolate', 'is_initialized', 'isfinite', 'l1_loss', 'linear', 'linspace', 'load', 'log', 'long', 'manual_seed', 'matmul', 'mean', 'meshgrid', 'minimum', 'mse_loss', 'nn', 'no_grad', 'ones', 'optim', 'outer', 'pad', 'pi', 'rand', 'randint', 'randn', 'randn_like', 'random_split', 'relu', 'save', 'set_grad_enabled', 'set_num_interop_threads', 'set_num_threads', 'sigmoid', 'silu', 'sin', 'softmax', 'sqrt', 'stack', 'tanh', 'tensor', 'topk', 'triu', 'uint8', 'use_deterministic_algorithms', 'utils', 'version', 'where', 'zeros', 'zeros_like']: used in 47 files (> 10)
- `PIL`: 23 file(s), surface ['BICUBIC', 'BILINEAR', 'Draw', 'GaussianBlur', 'Image', 'ImageDraw', 'ImageEnhance', 'ImageFilter', 'ImageFont', 'ImageOps', 'LANCZOS', 'Quantize', 'Resampling', 'UnidentifiedImageError', 'alpha_composite', 'exif_transpose', 'fit', 'fromarray', 'load_default', 'new', 'open', 'truetype']: used in 23 files (> 10)
- `requests`: 6 file(s), surface ['exceptions', 'get', 'post']: eligible
- `uvicorn`: 5 file(s), surface ['run']: eligible
- `datasets`: 2 file(s), surface ['load_dataset']: eligible
- `huggingface_hub`: 2 file(s), surface ['snapshot_download']: eligible
- `yt_dlp`: 3 file(s), surface ['YoutubeDL', 'utils']: eligible
- `diffusion`: 5 file(s), surface ['AudioSynthV2', 'CurriculumTrainer', 'DDPMScheduler', 'DOWNLOAD_PLAN', 'DPMSolver2M', 'KarrasSampler', 'LTXAdapter', 'MAX_REPLAY_CYCLES_PER_EPOCH', 'REPLAY_BATCH_SIZE', 'RealisticTimeSimulator', 'SCENARIO_INJECT_EVERY_N_STEPS', 'TextEncoder', 'TimeEncoder', 'TrainerV5', 'UNetV4', '_BURST_YEAR_WEIGHT', '_COND_DIM_V4', '_INTERP_YEAR_WEIGHT', '_REPLAY_YEAR_WEIGHT', '_TEXT_ENC_DIM_V4', '_TIME_ENC_DIM_V4', '_YEAR_EQUIV_STEPS_PER_MINUTE', '__new__', '_fmt_years', '_load_v4', 'get_bridge', 'get_engine', 'get_memory', 'load_engine_v2', 'load_engine_v2_full', 'tokenize', 'tokenize_v3', 'train_v4']: API surface of 33 symbols (> 12): too large to rebuild safely
- `psutil`: 1 file(s), surface ['cpu_percent', 'virtual_memory']: eligible
- `urllib3`: 1 file(s), surface ['PoolManager', 'Retry', 'Timeout']: eligible
- `compression`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `cors`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `express-rate-limit`: 11 file(s), surface unknown: used in 11 files (> 10)
- `undici`: 8 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@workspace/api-zod`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `chokidar`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `fast-glob`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `orval`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `drizzle-zod`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `puppeteer-core`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@workspace/db`: 12 file(s), surface unknown: used in 12 files (> 10)
- `@replit/object-storage`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@msgpack/msgpack`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `multer`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `pdfkit`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `anthropic`: 2 file(s), surface ['APIConnectionError', 'APIStatusError', 'Anthropic']: eligible
- `ws`: 7 file(s), surface unknown: automatic replacement is only supported for Python projects
- `gdb`: 12 file(s), surface ['TYPE_CODE_INT', 'TYPE_CODE_PTR', 'TYPE_CODE_STRUCT', 'TYPE_CODE_UNION', 'Type', 'VERSION', 'Value', 'ValuePrinter', 'current_objfile', 'lookup_type', 'parse_and_eval', 'printing', 'selected_inferior']: used in 12 files (> 10)
- `gdb_lookup`: 4 file(s), surface ['register_printers']: eligible
- `gdb_providers`: 4 file(s), surface ['*']: eligible
- `rust_types`: 12 file(s), surface ['*', 'EMPTY', 'ENUM', 'OTHER', 'REGULAR_ENUM', 'RustType', 'SINGLETON_ENUM', 'STD_ARC', 'STD_CELL', 'STD_HASH_MAP', 'STD_HASH_SET', 'STD_NONZERO_NUMBER', 'STD_OS_STRING', 'STD_PATH', 'STD_PATHBUF', 'STD_RC', 'STD_REF', 'STD_REF_CELL', 'STD_REF_MUT', 'STD_SLICE', 'STD_STR', 'STD_STRING', 'STD_VEC', 'STD_VEC_DEQUE', 'STRUCT', 'STRUCT_VARIANT', 'TUPLE', 'TUPLE_VARIANT', 'classify_struct', 'classify_union', 'is_tuple_fields']: used in 12 files (> 10)
- `lldb`: 8 file(s), surface ['CreateDataFromSInt64Array', 'CreateDataFromUInt64Array', 'SBData', 'SBError', 'SBTarget', 'SBType', 'SBTypeCategory', 'SBTypeNameSpecifier', 'SBTypeStaticField', 'SBTypeSummary', 'SBValue', 'debugger', 'eBasicTypeLong', 'eBasicTypeUnsignedChar', 'eBasicTypeUnsignedLong', 'eFormatChar', 'eTypeClassStruct', 'eTypeClassUnion']: API surface of 18 symbols (> 12): too large to rebuild safely
- `lldb_providers`: 4 file(s), surface ['*']: eligible
- `@jridgewell/trace-mapping`: 7 file(s), surface unknown: automatic replacement is only supported for Python projects
- `ast-v8-to-istanbul`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `istanbul-lib-coverage`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `istanbul-lib-report`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@vitest/coverage-v8`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `vitest`: 7 file(s), surface unknown: automatic replacement is only supported for Python projects
- `common`: 36 file(s), surface ['ROOT', 'clean_environment', 'coverage_parse_exclusions', 'run_command', 'sanitize', 'source_inputs', 'source_revision', 'write_json']: used in 36 files (> 10)
- `@neondatabase/serverless`: 8 file(s), surface unknown: automatic replacement is only supported for Python projects
- `<spec>`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `spec`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `file:`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@electron/asar`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@tensorflow/tfjs`: 24 file(s), surface unknown: used in 24 files (> 10)
- `ignore`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `pip`: 2 file(s), surface ['Marker', 'Requirement', 'canonicalize_name']: eligible
- `@anthropic-ai/sdk`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_import_jobs_user_idx ON catalog_import_jobs(user_id, created_at)`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `starlette`: 1 file(s), surface ['Request']: eligible
- `x`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@maxbooster/electron-download-transport`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `tsx`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `otplib`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `junit_evidence`: 1 file(s), surface ['read_cases']: eligible
- `eslint`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `exceljs`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `pkg`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `cookie-parser`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `express-session`: 7 file(s), surface unknown: automatic replacement is only supported for Python projects
- `bcrypt`: 4 file(s), surface unknown: security-sensitive (crypto/auth/TLS): never rebuilt in-house automatically
- `@sentry/node`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `…`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `https-proxy-agent`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `ioredis`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `bullmq`: 6 file(s), surface unknown: automatic replacement is only supported for Python projects
- `stripe`: 19 file(s), surface unknown: used in 19 files (> 10)
- `helmet`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `express-validator`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `dd-trace`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `newrelic`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `axios`: 10 file(s), surface unknown: automatic replacement is only supported for Python projects
- `twitter-api-v2`: 3 file(s), surface unknown: automatic replacement is only supported for Python projects
- `cookie`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `cookie-signature`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `libphonenumber-js`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `twilio`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `csv-parse`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `graphql`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@shared/config`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `prom-client`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@shared/domainValidation.js`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@peculiar/x509`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `wavefile`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `ffmpeg-static`: 7 file(s), surface unknown: automatic replacement is only supported for Python projects
- `fft.js`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `fluent-ffmpeg`: 7 file(s), surface unknown: automatic replacement is only supported for Python projects
- `music-metadata`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `node-wav`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `mediasoup`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `archiver`: 4 file(s), surface unknown: automatic replacement is only supported for Python projects
- `xmlbuilder2`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `web-push`: 2 file(s), surface unknown: automatic replacement is only supported for Python projects
- `digitalgpu`: 5 file(s), surface ['get_gpu', 'gpu_info']: eligible
- `scipy`: 3 file(s), surface ['convolve2d', 'gaussian_filter']: eligible
- `cv2`: 1 file(s), surface ['CAP_PROP_FRAME_COUNT', 'CAP_PROP_POS_FRAMES', 'COLOR_BGR2RGB', 'VideoCapture', 'cvtColor']: eligible
- `frameGenerator`: 1 file(s), surface ['generate_frame']: eligible
- `av`: 4 file(s), surface ['VideoFrame', 'open']: eligible
- `audioflux`: 1 file(s), surface ['BFT', 'type']: eligible
- `dask`: 1 file(s), surface ['Client', 'compute', 'delayed']: eligible
- `h5py`: 1 file(s), surface ['File', 'string_dtype']: eligible
- `diffusers`: 1 file(s), surface ['LTXVideoConditioningPipeline', 'from_pretrained']: eligible
- `dns-packet`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `dns2`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `node-fetch`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `resend`: 5 file(s), surface unknown: automatic replacement is only supported for Python projects
- `videoNeuralNet`: 1 file(s), surface ['predict_visual_params']: eligible
- `jsonwebtoken`: 1 file(s), surface unknown: security-sensitive (crypto/auth/TLS): never rebuilt in-house automatically
- `@labelgrid/core`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `googleapis`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `swagger-jsdoc`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `swagger-ui-express`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `@tensorflow/tfjs-node`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `essentia.js`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `tailwindcss`: 1 file(s), surface unknown: automatic replacement is only supported for Python projects
- `tools`: 4 file(s), surface ['CudaRuntimeShim', 'Dim3', 'WARP_SIZE', 'cudaMemcpyDeviceToHost', 'cudaMemcpyHostToDevice', 'cudaMemcpyKind', 'dummy_kernel', 'launch_kernel', 'launch_warp_kernel', 'reduction_redesigned_sm102_kernel', 'reduction_redesigned_sm102_kernel_warp', 'warp_shfl_down_vec']: eligible
- `scheduler`: 1 file(s), surface ['VGPUTimeSlicer']: eligible
- `infer`: 2 file(s), surface ['DDIMSampler', 'DigitalGPUPostProcessor', 'SCENE_PRESETS', 'VideoGenerationPipeline', 'get', 'get_corpus_bridge', 'get_training_state', 'is_trained', 'keys', 'simulated_years']: eligible
- `models`: 4 file(s), surface ['LatentDiffusionVideo', 'MusicConditioner', 'NoiseScheduler', 'SRUNet3D', 'STYLE_NAME_TO_ID', 'TextConditioner', 'VideoDiT', 'VideoVAE3D', 'emotional_heat_from_label', 'get']: eligible
- `torchvision`: 1 file(s), surface ['write_video']: eligible
- `utils`: 6 file(s), surface ['cleanup_ddp', 'compile_fn', 'get_digital_gpu', 'get_logger', 'gpu_status', 'is_main', 'load_checkpoint', 'save_checkpoint', 'setup_ddp']: eligible
- `yaml`: 3 file(s), surface ['safe_load']: eligible
- `data`: 2 file(s), surface ['CaptionedVideoDataset', 'VideoDataset', 'VideoTransform']: eligible

## Modules

### `.pdim-cluster-test-Pidv4k/cluster-fixture.mjs`

(analysis failed: ValueError)


### `AI enhancements/advancedVideoRendererService.ts`

Orchestrates AI video generation for Max Booster through the external MaxCore AI server. It generates hook/body/CTA content and sentiment, submits a video job (or takes a synchronous result), and polls until it finishes. It then downloads the MP4 into uploads/videos, falling back to a proxy URL or local scene assembly. Finally it composites text overlays and an optional AI voiceover with local FFmpeg. A separate 'photorealistic' branch builds a MaxCore-generated image (or a Sharp gradient), applies a Ken Burns zoom, and composites text over it. The header claims 'no local FFmpeg fallback', but FFmpeg is used throughout for post-processing and scene assembly.

- `maxcoreVideoUrlStore` [complete/medium]: Exported in-memory map of filename to absolute MaxCore URL, so the video-proxy route can stream videos that could not be cached locally.
- `urlStoreSet` [complete/high]: Insert a filename→URL mapping into maxcoreVideoUrlStore, evicting the oldest entry when the cap is reached, to bound memory.
- `maxcoreAuthHeaders` [complete/high]: Build the auth header set for MaxCore requests, sending the same key via X-Admin-Key, X-API-Key and a Bearer token.
- `looksLikeRealVideo` [complete/high]: Validate that a downloaded buffer is an actual video and not MaxCore's SPA HTML (200 OK for unknown paths), using magic bytes with a size/HTML-heuristic fallback.
- `extractJobUuid` [complete/high]: Pull a UUID out of a filename such as video_<uuid>.mp4 to build job-ID-based download URLs.
- `candidateUrls` [complete/high]: Generate a prioritized list of guessed MaxCore URLs from which the rendered video might be downloaded. The order is job-UUID API routes, then filename API routes, then the raw URL and static paths.
- `cacheVideoLocally` [complete/high]: Download a MaxCore-rendered video into LOCAL_VIDEO_DIR by trying many candidate URLs with auth and validating the bytes. If none work, return a proxy URL so the server can stream it later.
- `CompositeOpts` [complete/high]: Options interface for compositing: voiceover flag, genre, duration, artist name, topic.
- `compositeTextOnLocalVideo` [complete/high]: Shared compositor. It burns wrapped hook/body/CTA text onto a local video using FFmpeg drawtext. It optionally adds an AI voiceover, preferring MaxCore /generate/audio and falling back to local TTS. It writes comp_<name>.mp4.
- `compositeTextOnLocalVideo.sanitize` [complete/high]: Inner helper that strips characters ('":\,[]%) that break FFmpeg drawtext parsing and collapses whitespace.
- `compositeTextOnMaxcoreVideo` [complete/high]: Thin wrapper that composites text on a locally cached MaxCore video, resolving the served URL to a file path. It returns the original URL on any failure or when there is nothing to do.
- `MaxCoreVideoStatus` [complete/medium]: Type for the MaxCore /video-job/<id> status payload.
- `assembleVideoFromScenes` [complete/medium]: Fallback that builds a playable MP4 locally from MaxCore scene text. It renders one solid-color clip per scene with drawtext, then concatenates the clips. It is used when MaxCore reports success but the video bytes cannot be downloaded.
- `pollVideoJob` [complete/high]: Poll the MaxCore video job endpoint every 2s (up to 150 attempts, about 5 min) until done, error, or timeout. On done it caches the video, or assembles it from scenes if only the proxy is available, and returns a VideoGenResult.
- `PHOTO_ASPECT_DIMS / SCENE_BG / SCENE_DURATION_S` [complete/high]: Constant lookup tables: aspect ratio to pixel dimensions, scene type to background color, and scene type to clip seconds.
- `fetchPhotorealisticImage` [complete/high]: Exported. Obtain a photorealistic background image for a video by prompting MaxCore /generate/image with a music-scene prompt, then caching it locally. It falls back to a genre gradient image on any failure.
- `generatePhotoGradientFallback` [complete/high]: Create a vivid three-stop vertical gradient PNG, keyed to the genre palette, as an offline substitute for an AI image. If Sharp fails, it writes a 1x1 black PNG.
- `kenBurnsAnimate` [complete/medium]: Turn a still image into a base MP4 with a slow centered zoom-in (Ken Burns effect) via FFmpeg zoompan at 24 fps.
- `renderPhotorealisticVideo` [complete/high]: Run the full photorealistic pipeline: fetch image, Ken Burns animate, then composite text and voiceover. It returns a VideoGenResult with metadata and the intelligence fields, or a failure result.
- `MaxCoreContent / MaxCoreSentiment` [complete/medium]: Types for the MaxCore content-generation and sentiment responses.
- `generateContent` [complete/high]: Step 1: call MaxCore /generate/content to produce hook/body/CTA/hashtags from the artist, topic, genre, platform, tone and goal.
- `getSentiment` [complete/high]: Step 2: score the hook's sentiment through MaxCore /analyze/sentiment.
- `renderVideo` [complete/high]: Exported entry point. Generates content and sentiment, then either branches to the photorealistic pipeline or submits a MaxCore video job. It handles synchronous (url) and asynchronous (job_id) responses, caches the video, composites text and voiceover, and returns a VideoGenResult with intelligence metadata.

### `client/src/components/admin/MaxCoreCognitiveConsole.tsx`

Admin React console for the MaxCore cognitive runtime. It polls the /api/maxcore/cognitive endpoints for status, organization data, expansion status and tool catalog. It shows readiness, capabilities and record counts, and lets the owner register offline agents, create tasks, store memories, run or retry pending/blocked tasks, and run a read-only knowledge search. The UI is deliberately conservative about claims, e.g. agents are saved offline and tasks are not complete until a verified result.

- `isRecord` [complete/high]: Type guard that tells whether a value is a plain JSON object, excluding null and arrays.
- `apiResult` [complete/high]: Fetch wrapper that sends credentialed JSON requests, parses the body safely into an object, and throws on non-OK responses. It tolerates HTTP 207 always and HTTP 503 when allowNotReady is set, so degraded status can still be displayed.
- `postJson` [complete/high]: POST a JSON body to a path with the CSRF token header attached when the cookie holds one.
- `arrayOf` [complete/high]: Coerce an unknown value to an array of entity records, dropping non-object items and returning [] for non-arrays.
- `entityValue` [complete/high]: Read a field from an entity, looking first at the top level, then in entity.data, then in entity.payload.
- `textValue` [complete/high]: Return the value if it is a non-blank string, otherwise a display fallback (default '—').
- `errorMessage` [complete/high]: Extract a user-displayable message from an unknown thrown value.
- `Capability` [complete/high]: Small presentational badge showing whether a named capability is available or unavailable, with an aria-label.
- `MaxCoreCognitiveConsole` [complete/medium]: Main admin console component. It polls status, organization, expansion and tool-catalog data. It renders readiness alerts, capability badges, loaded record counts, expansion rules, relationship and event lists, and forms to create agents, tasks and memories. It lists recent tasks with run/retry buttons gated on agentExecutionReady, and offers a read-only search.
- `MaxCoreCognitiveConsole.invalidateCognitive` [complete/high]: Invalidate all cached maxcore-cognitive queries so they refetch, used after each successful mutation and by the Refresh button.

### `client/src/components/settings/SettingsOutcomeHandler.tsx`

Central place for user feedback in the settings area of the Max Booster client. It defines a typed catalogue of settings outcomes (profile, security, notifications, privacy, connected accounts, API keys), each mapped to a toast title, description, icon and variant. It also provides three hooks: one that shows outcome toasts and tracks recent outcomes and per-key processing flags, one for per-key button loading state, and one for client-side validation of profile form fields (username, email, bio, website).

- `useSettingsOutcomes` [complete/medium]: Hook that lets settings screens report a named outcome. It shows the matching toast, keeps a short history of recent outcomes, and tracks per-key 'processing' flags.
- `useLoadingState` [complete/medium]: Hook that manages loading flags, with optional loading text, keyed by string. It is meant for settings buttons that need spinners or 'Saving...' labels.
- `useFormValidation` [partial/medium]: Hook that provides synchronous validators for settings profile form fields (username, email, bio, website). It keeps an aggregated error map in state and can clear errors per field or all at once.
- `outcomeConfigs` [complete/high]: Lookup table from each OutcomeType to its toast title, description, icon, variant and settings category. It is exported both as a const and re-exported at the bottom of the file.

### `client/src/hooks/useBatchAction.ts`

Client React hook layer for bulk operations on resources (delete, update, export, submit, takedown, schedule, move, download, compare). A generic `useBatchAction` posts a list of IDs to `/api/batch/<resource>/<action>`, validates the response, tracks status and progress, shows toasts, and invalidates React Query caches. Domain wrappers (distribution, social, marketplace, files, analytics) preconfigure resource, action, messages and cache keys.

- `parseBatchResultResponse` [complete/high]: Parse and strictly validate a batch API response against the IDs that were requested, returning a typed BatchResult. It throws if the server's counts or ID sets are inconsistent with the request.
- `useBatchAction` [partial/high]: Core hook that runs a batch action against the batch API. It exposes a state machine (idle, confirming, processing, completed, partial, failed, cancelled), simulated progress, the result and error, and the controls confirm, execute, cancel, reset and retryFailed.
- `useDistributionBatchActions` [complete/high]: Wrapper hook for batch operations on distribution releases: submit, takedown, update and delete. Each one invalidates /api/distribution/releases.
- `useSocialBatchActions` [complete/high]: Wrapper hook for batch operations on social posts: schedule (with scheduledTime), delete and update. Invalidates the social posts and calendar queries.
- `useMarketplaceBatchActions` [complete/high]: Wrapper hook for batch operations on marketplace beat listings: generic update, delete, bulk price update and bulk license update. Invalidates /api/marketplace/beats and /api/marketplace/my-beats.
- `useFileBatchActions` [complete/high]: Wrapper hook for batch operations on files: delete, move to a folder, prepare a download, and update metadata. It invalidates file listing and storage quota queries where state changes.
- `useAnalyticsBatchActions` [complete/high]: Wrapper hook for batch analytics operations: export (format and optional dateRange) and compare multiple items.

### `client/src/hooks/useBatchActions.ts`

Client-side React hook library for running bulk operations (delete, update, export, submit, schedule, etc.) against `/api/batch/{resource}/{action}`. It manages the confirm/processing/result state machine, simulated or polled progress, toasts, React Query invalidation and retry. It also provides resource-specific wrapper hooks (releases, tracks, posts, beats, analytics) and strict validators for server responses. It re-exports legacy hooks from ./useBatchAction.

- `parseBatchActionsResponse` [complete/high]: Parse and strictly validate the JSON body of a batch-action response, checking it against the ids that were requested. Returns a normalized BatchResult or throws.
- `parseBatchJobProgressResponse` [complete/high]: Validate the JSON body of a batch job progress poll response, checking it matches the expected job id and is internally consistent.
- `useBatchActions` [partial/high]: Core hook that executes a batch action against the server. It tracks status (idle/confirming/processing/completed/partial/failed/cancelled), progress, result and error. It shows toasts, invalidates React Query keys, supports a confirm step, cancel, reset and retry of failed items, and offers either simulated progress or server job polling.
- `useReleaseBatchActions` [complete/high]: Wrap useBatchActions with convenience actions for distribution releases: submit, delete and update.
- `useTrackBatchActions` [complete/high]: Convenience wrapper for batch operations on studio tracks: move, tag, export and delete.
- `usePostBatchActions` [complete/high]: Convenience wrapper for batch operations on social posts: schedule, delete and approve.
- `useBeatBatchActions` [complete/high]: Convenience wrapper for batch operations on marketplace beats: update prices, update licenses and delete.
- `useAnalyticsBatchActions` [complete/medium]: Convenience wrapper for batch analytics export and comparison.

### `client/src/hooks/useBatchProgress.ts`

React hooks for tracking the progress of a batch operation (bulk uploads, processing, etc.). The core hook keeps a state machine (idle, starting, processing, completed, partial, failed, cancelled) with counts, failures, percentage, elapsed time and ETA. It can be driven manually through start/update/succeed/fail/complete, or by polling `/api/batch/progress/:jobId` for a server-side job. A dialog wrapper adds modal state, and a sequential runner executes an item list while reporting progress.

- `formatTime` [complete/high]: Format a millisecond duration as a short human-readable string (`Xs`, `Xm Ys`, or `Xh Ym`) for the elapsed and remaining time displays.
- `parseBatchProgressResponse` [complete/high]: Parse and strictly validate the JSON body of a batch-progress poll response, so malformed or mismatched server data is rejected instead of corrupting hook state.
- `useBatchProgress` [partial/high]: Main hook that manages batch progress state. Callers drive it manually with start/update/succeed/fail/complete/cancel/reset, or it polls the backend for a job when a jobId is set while status is 'processing'. It also exposes derived flags and formatted times.
- `useBatchProgressDialog` [partial/medium]: Wrap useBatchProgress with open/title/description state and produce a `dialogProps` bundle for a batch progress/result dialog component.
- `useSequentialBatchProgress` [partial/medium]: Process an array of items one at a time with an async handler while reporting progress through useBatchProgress. Exposes processAll and abort. This function is not in the deterministic inventory but is present in the file.

### `client/src/hooks/useBulkAction.ts`

React hooks for running bulk operations (delete, update, export, status change, submit, withdraw, schedule, process) against /api/batch/:resource/:action endpoints. They manage a confirm/processing/completed/partial/failed state machine, progress, toasts, and React Query invalidation, and validate the server's bulk response shape.

- `parseBulkActionResponse` [complete/high]: Parse and strictly validate a bulk-operation HTTP response so it matches the requested ids, and return a typed BulkActionResult. It throws if the payload is malformed or has inconsistent counts or unexpected ids.
- `useBulkAction` [partial/high]: Core hook that exposes execute, confirm, cancel and reset for bulk actions. It maps an action type to a batch endpoint and HTTP method, calls the API, validates the response, updates status, progress and result state, shows toasts, invalidates queries and fires callbacks.
- `useBulkDelete` [complete/high]: Convenience wrapper around useBulkAction that adds a deleteItems(ids) function for a resource, with preset messages and invalidation of /api/{resource}.
- `useBulkUpdate` [complete/high]: Wrapper hook that provides updateItems(ids, data) to bulk-update a resource's items.
- `useBulkExport` [partial/medium]: Wrapper hook that provides exportItems(ids, format='csv') to request a bulk export of a resource.
- `useBulkStatusChange` [complete/high]: Wrapper hook that provides changeStatus(ids, status) to bulk-set a status field on items.

### `client/src/hooks/useModuleShortcuts.ts`

Provides a React hook that registers a set of keyboard shortcuts for a given app module (studio, analytics, social, distribution, marketplace) with a central ShortcutContext, plus default shortcut definitions per module and thin per-module wrapper hooks that let callers override handlers by shortcut id.

- `useModuleShortcuts` [complete/medium]: Register a list of module-scoped shortcuts with the shortcut context on mount, set the active shortcut context to the module, unregister them on cleanup, and return the shortcuts registered for that context.
- `useStudioShortcuts` [partial/medium]: Register the default studio shortcuts (transport, track, editing, view), substituting caller-provided handlers by shortcut id.
- `useAnalyticsShortcuts` [partial/medium]: Register the default analytics shortcuts (refresh, export, date range, compare, filters, fullscreen) with optional handler overrides.
- `useSocialShortcuts` [partial/medium]: Register the default social-media shortcuts (schedule, preview, new post, calendar, drafts, analytics, inbox) with optional handler overrides.
- `useDistributionShortcuts` [partial/medium]: Register the default music-distribution shortcuts (new release, submit, upload, metadata, status, schedule) with optional handler overrides.
- `useMarketplaceShortcuts` [partial/medium]: Register the default marketplace shortcuts (search, filter, play preview, add to cart, favorite) with optional handler overrides.

### `client/src/hooks/useTemplate.ts`

React hook module for the studio template feature. It fetches, creates, updates, deletes, duplicates, applies (creates projects from) and saves templates through the /api/studio/templates endpoints. It adapts the server's template shape (category/templateData/isBuiltIn) to the client's Template shape and validates every API response strictly. It also provides a library-view hook with grouping, recent/popular lists, and JSON import/export.

- `normalizeTemplate` [complete/high]: Validate a raw server template object and map it to the client Template shape (category→type, templateData→data, isBuiltIn→isDefault/isShared). It throws if required fields are missing or mistyped.
- `parseTemplateResponse` [complete/high]: Read a fetch Response body as JSON and normalize it into a single Template.
- `parseTemplateListResponse` [complete/high]: Parse a list response of the form {templates: [...]} and normalize every entry.
- `requireSuccessResponse` [complete/high]: Assert that a response body is a JSON object with success === true (used for delete), throwing a context-labelled error otherwise.
- `requireCreatedProjectResponse` [complete/high]: Assert that a create-project-from-template response contains a non-empty string id.
- `toStudioTemplatePayload` [complete/high]: Convert a client CreateTemplateInput into the server create-template request body.
- `toStudioTemplateUpdatePayload` [complete/high]: Build a PATCH body from partial input, including only provided name/description/type/tags. It explicitly rejects unsupported edits to data and isShared.
- `useTemplate` [complete/medium]: Main hook. It lists templates (optionally filtered by type) and exposes create, update, delete, apply-to-projects, duplicate, get-by-id and save-selection-as-template operations. Loading, creating and applying states come with toast feedback and cache invalidation.
- `extractCommonFields` [complete/medium]: Derive template data from selected items. For none it returns {}. For one it returns a shallow copy of that item. For several it returns only the fields whose JSON-serialized value is identical across all items, excluding id, createdAt and updatedAt.
- `useTemplateLibrary` [complete/high]: Hook for a template library view. It loads all templates and derives groupings: by type, defaults, shared, 5 most recently updated and 5 most used. It also provides JSON file import and browser-download export of templates.

### `client/src/hooks/useWebSocket.ts`

React hook that opens and manages a same-origin WebSocket connection (/ws), exposing connection state, send/connect/disconnect controls, and automatic bounded reconnection, with callbacks for connect, message, disconnect and error events.

- `useWebSocket` [partial/high]: Hook that connects to the app's /ws endpoint on mount, tracks connection status, forwards parsed JSON messages to a callback, auto-reconnects up to a limit, and disconnects on unmount.
- `useWebSocket.connect` [complete/high]: Open a WebSocket to the current host's /ws (wss when on https), wire up handlers, and update status. No-op if a socket is already open.
- `useWebSocket.disconnect` [partial/medium]: Cancel any pending reconnect timer and close and clear the current socket.
- `useWebSocket.sendMessage` [complete/high]: Serialize a message as JSON and send it over the socket if it is open.

### `client/src/lib/a11y/focus.ts`

Accessibility focus-management helpers for the React client. It covers saving and restoring focus and scroll position, a singleton focus stack for modal-style flows, focusing the first, last or nth focusable child, next/previous traversal with wrap-around, focus-ring styling, tabindex manipulation, a focusability check, and a focus scope that disables tabbing outside a container (modal focus trapping). It builds on getFocusableElements from '@/lib/accessibility'.

- `FocusRestoreState` [complete/high]: Interface for a snapshot of the focused element and window scroll offsets, so focus can be restored later.
- `saveFocusState` [complete/high]: Capture the currently focused element and the window scroll position, typically before opening a modal or overlay.
- `restoreFocusState` [complete/high]: Re-focus the saved element if it is still in the DOM, then scroll the window back to the saved position.
- `FocusManager` [complete/high]: Singleton holding a LIFO stack of focus snapshots, so nested overlays can each save and restore focus.
- `FocusManager.getInstance` [complete/high]: Lazily create and return the singleton FocusManager.
- `FocusManager.push` [complete/high]: Push the current focus/scroll state onto the stack.
- `FocusManager.pop` [complete/high]: Pop the latest snapshot and restore it on the next animation frame, so it runs after the overlay has unmounted.
- `FocusManager.clear` [complete/high]: Discard all saved focus states.
- `FocusManager.depth` [complete/high]: Getter returning the number of saved focus states.
- `focusManager` [complete/high]: Exported shared singleton instance of FocusManager.
- `focusFirstElement` [complete/high]: Focus the first focusable descendant of a container. If there is none, make the container itself programmatically focusable and focus it.
- `focusLastElement` [complete/high]: Focus the last focusable descendant of a container.
- `focusByIndex` [complete/high]: Focus the focusable descendant at a given index.
- `getNextFocusable` [complete/high]: Return the next focusable element after currentElement, wrapping to the first. Used for arrow-key or Tab cycling.
- `getPreviousFocusable` [complete/high]: Return the previous focusable element before currentElement, wrapping to the last.
- `FocusIndicatorOptions` [complete/high]: Options interface for focus ring styling: offset, color, width, line style and border radius.
- `createFocusIndicatorStyles` [complete/medium]: Build a CSS declaration string for a focus outline from the options.
- `applyFocusIndicator` [complete/high]: Attach focus and blur listeners to an element that apply or remove an inline outline style. Returns a cleanup function.
- `applyFocusIndicator.handleFocus` [complete/high]: Focus listener that sets the outline, offset and radius inline styles.
- `applyFocusIndicator.handleBlur` [complete/high]: Blur listener that restores the original inline styles.
- `setTabOrder` [complete/high]: Assign sequential tabindex values to a list of elements, starting at startIndex.
- `removeFromTabOrder` [complete/high]: Take an element out of the tab sequence by setting tabindex=-1.
- `addToTabOrder` [complete/high]: Put an element in the tab sequence by setting tabindex (default 0).
- `isElementFocusable` [partial/medium]: Heuristically decide whether an element can receive keyboard focus.
- `moveFocusWithinContainer` [complete/high]: Move focus to the next or previous focusable element inside a container. If focus is outside, move it to the first element.
- `createFocusScope` [partial/medium]: Create a focus-trap-like scope. lock() disables tabbing to every focusable element outside the container, and unlock() restores them.
- `createFocusScope.lock` [complete/medium]: Record and set tabindex=-1 on every focusable element outside the container, and mark each with data-focus-scope-disabled.
- `createFocusScope.unlock` [complete/high]: Restore the original tabindex on each affected element, remove the marker attribute and clear the record.

### `client/src/lib/a11y/keyboard.ts`

Keyboard-accessibility helpers for the client: a modal-style focus trap, roving tabindex for composite widgets, a document-level Escape handler, simple arrow-key navigation over a list of items, and a typeahead matcher. Each factory returns a cleanup or control function so callers can attach and detach listeners.

- `createFocusTrap` [complete/high]: Create a focus trap bound to a container. While active it keeps Tab/Shift+Tab cycling inside the container, optionally calls onEscape on Escape, blocks outside clicks, and restores focus on deactivate.
- `createFocusTrap.handleKeyDown` [partial/medium]: Document keydown handler. Routes Tab to the wrap logic. On Escape, if escapeDeactivates is set, it prevents the default action and calls onEscape.
- `createFocusTrap.handleTabKey` [partial/medium]: Wrap focus at the container boundaries. Shift+Tab on the first element moves focus to the last, and Tab on the last moves it to the first.
- `createFocusTrap.handleClick` [complete/high]: Capture-phase click guard. Clicks outside the container are blocked and focus is returned inside, unless allowOutsideClick is set.
- `createFocusTrap.focusFirstElement` [complete/high]: Move focus into the container. It prefers initialFocus (element or selector), then the first focusable element, and otherwise makes the container itself focusable with tabindex=-1 and focuses it.
- `createFocusTrap.activate` [complete/high]: Start trapping. Remembers the currently focused element, registers the keydown and capture click listeners, and focuses into the container on the next animation frame.
- `createFocusTrap.deactivate` [complete/high]: Stop trapping. Removes the listeners and optionally restores focus to the previously focused element.
- `createFocusTrap.pause` [complete/high]: Temporarily suspend trap behavior without removing the listeners.
- `createFocusTrap.unpause` [complete/high]: Resume trap behavior after pause.
- `createRovingTabIndex` [partial/medium]: Implement the roving-tabindex pattern. Exactly one matching item has tabindex=0 and the rest have -1, and arrow, Home and End keys move focus and the tabindex among items, with optional looping, grid columns and a focus-change callback.
- `createRovingTabIndex.updateTabIndex` [complete/high]: Set tabindex 0 on the focused item and -1 on all others.
- `createRovingTabIndex.handleKeyDown` [complete/high]: Translate arrow, Home and End keys into a next index based on orientation, apply loop or clamp, then focus the item, update tabindex and fire onFocusChange.
- `createEscapeHandler` [complete/high]: Register a document-level Escape key listener that invokes a callback, optionally stopping propagation.
- `createEscapeHandler.handleKeyDown` [complete/high]: Inner handler that detects Escape and runs the callback.
- `setupArrowNavigation` [complete/high]: Provide simple arrow, Home and End keyboard navigation among items inside a container, for a single horizontal or vertical orientation, with optional looping and a navigate callback.
- `setupArrowNavigation.handleKeyDown` [complete/high]: Compute the next index from the key pressed, then focus that item and notify via onNavigate.
- `handleTypeahead` [complete/medium]: Build a typeahead matcher. Each call appends a character to a buffer that resets after an idle timeout, and the matcher returns the first item whose label starts with the buffer.

### `client/src/lib/video/RenderOrchestrator.ts`

(analysis failed: ValueError)


### `client/src/lib/video/TemplateCompiler.ts`

Compiles high-level promo template options (release, tour, behind-the-scenes, quote, countdown, split, teaser) into a renderer-ready VideoProject, with layers, keyframes, audio-reactive bindings and metadata. Also provides helpers to fill default options, rescale a project to another aspect ratio, and append visualizer or particle layers.

- `generateId` [complete/high]: Generate a pseudo-unique string id with a prefix from the timestamp and a random base-36 suffix.
- `getDefaultTransform` [complete/high]: Return a fresh shallow copy of the shared DEFAULT_TRANSFORM so callers can mutate it safely.
- `compileTemplate` [partial/high]: Public entry point: compile template options into a CompilationResult in two steps, template compilation then conversion to renderer types.
- `compileTemplateToCompiledTemplate` [complete/high]: Dispatch on options.type to the matching compile* function from PromoTemplates.
- `convertCompiledTemplateToResult` [complete/medium]: Convert a CompiledTemplate into a CompilationResult: layers, keyframes, audio bindings, VideoProject and metadata including an estimated render time.
- `convertTemplateLayers` [complete/high]: Map all template layers to LayerConfig objects.
- `convertTemplateLayer` [complete/medium]: Convert one TemplateLayer into a LayerConfig; only the first animation is attached to it.
- `mapLayerType` [complete/high]: Map template layer types onto renderer layer types (video becomes image; unknown becomes background).
- `convertLayerConfig` [complete/high]: Route a layer's raw config to the type-specific converter.
- `convertBackgroundConfig` [complete/high]: Translate template background config fields (gradientColors, gradientAngle) into renderer BackgroundConfig (colors, angle).
- `convertTextConfig` [complete/high]: Build renderer TextConfig from raw config, applying defaults (Inter, 24px, white, center/middle).
- `convertImageConfig` [complete/high]: Build renderer ImageConfig; src falls back to imageUrl and fit defaults to 'contain'.
- `convertShapeConfig` [complete/high]: Build renderer ShapeConfig, mapping shapeType to type (default 'rectangle').
- `convertParticleConfig` [complete/high]: Build renderer ParticleConfig with defaults; the emission area defaults to the full canvas.
- `convertVisualizerConfig` [complete/high]: Build renderer VisualizerConfig, mapping visualizerType to type (default 'spectrum', color '#00ff88').
- `extractKeyframes` [complete/high]: Flatten every layer animation into start and end keyframes and sort them by time.
- `extractAudioReactiveBindings` [complete/medium]: Collect audio-reactive bindings from per-layer settings (bass, smoothing 0.8) and from global option targets, without duplicating layer+property pairs.
- `estimateRenderTime` [complete/high]: Heuristically estimate render time in seconds: frames × 16ms × (1 + 0.1×layers).
- `createVideoProjectFromTemplate` [complete/high]: Convenience API: build full options with defaults from partial input, compile them, and return just the VideoProject.
- `buildFullOptions` [complete/high]: Fill a partial options object with defaults (palette, gradient background, 16:9, 10s, 30fps, and per-type placeholder content) to produce valid PromoTemplateOptions.
- `scaleProjectToAspectRatio` [complete/medium]: Rescale a project's dimensions, layer transforms, configs and keyframes to a target aspect-ratio preset.
- `scaleLayerConfig` [partial/medium]: Scale size-related numeric config fields (fontSize, width, height, radius, barWidth, lineWidth) by the scale factors.
- `addVisualizerToProject` [complete/high]: Return a new project with an audio visualizer layer appended, using default styling merged with overrides.
- `addParticlesToProject` [complete/high]: Return a new project with a particle effect layer appended, with default particle settings overridden by user config.

### `client/src/lib/video/maxcoreVideoRenderer.ts`

Client-side (browser) promotional video renderer for MaxCore job metadata. The server's generated video URL is 404, so this module draws a five-scene timeline (intro, hook, body, CTA, outro) onto a Canvas, with template-specific visuals. It applies cinematic post-processing (color grade, vignette, film grain), records the canvas with MediaRecorder, and returns a playable WebM/MP4 blob URL. The only public export is renderMaxcoreVideo, plus the exported interfaces.

- `getPalette` [complete/high]: Choose the visual palette for a job: look up by template or template_name, fall back to 'default', and override background and accent colors with meta.bgColor and meta.accentColor if given.
- `clamp` [complete/high]: Clamp a number to [lo, hi], default [0,1].
- `smoothstep` [complete/high]: Smooth Hermite easing 3t²−2t³ for t in [0,1].
- `easeIn` [complete/high]: Cubic ease-in (t³).
- `easeOut` [dead/medium]: Cubic ease-out (1-(1-t)³).
- `fade` [complete/high]: Envelope: smooth fade-in until inEnd, hold at 1, then smooth fade-out from outStart to outEnd.
- `wrapLines` [complete/high]: Greedy word-wrap of text into lines that fit maxW, measured with the context's current font.
- `drawText` [partial/medium]: Draw text with alpha, optional glow shadow, horizontal slide-in that shrinks as alpha rises, and optional wrapping. Returns the next y position.
- `revealedText` [complete/high]: Kinetic word-reveal: return the first ceil(reveal*N) words, minimum one.
- `buildGrainFrames` [complete/high]: Pre-generate N (default 8) tiles, at most 256×256, of Gaussian noise centered at gray 128. Warm or cool palettes bias the R/B channels. The tiles are composited as film grain.
- `compositeGrain` [complete/high]: Overlay the grain tile chosen by frameIndex, tiled across the canvas, with soft-light blend at alpha = grainAmount.
- `drawCinematicBg` [complete/high]: Draw a layered animated background: base fill, haze, a breathing key light, a rim light, and a drifting specular highlight.
- `drawVignette` [complete/high]: Apply a lens-style radial edge darkening scaled by strength.
- `applyColorGrade` [complete/high]: Split-tone grade: multiply a shadow tint over the lower half, screen a highlight bloom at the key light, and add a subtle overlay contrast lift.
- `drawRadialBg` [complete/high]: Legacy alias that delegates to drawCinematicBg.
- `drawLinearBg` [complete/high]: Legacy alias that delegates to drawCinematicBg.
- `drawPlatformChrome` [complete/high]: Draw a subtle platform-specific overlay: a TikTok scrubber and icon dots, an Instagram story progress ring, or YouTube letterbox bars.
- `drawIntroScene` [complete/high]: Branded cold open: background, expanding accent rings, a drawing accent line, the uppercase artist or topic name, and a tagline from the first 5 hook words (or 'NEW RELEASE').
- `drawHookScene` [partial/medium]: Hook scene: large kinetic word-reveal hook text with glow, template-specific backdrops (letterbox and spotlight, EQ bars, lyric glow), an accent underline and an artist watermark.
- `drawBodyScene` [complete/high]: Body scene: a template-specific centrepiece (EQ visualizer, spinning vinyl, stage beams with crowd dots, spotlight beam), up to 3 lines of staggered body copy, lyric-video lines and a small hook reminder at the top.
- `drawCtaScene` [partial/high]: Conversion scene: pulsing glow, a hook recap, a pill CTA button with a pulse ring, the artist name, and up to 5 hashtags.
- `drawOutroScene` [complete/high]: Final lock-up: dark fill, fading accent glow, collapsing rings, and the artist name fading out.
- `buildScenes` [complete/high]: Create the 5 Scene descriptors with overlapping time windows: intro 0–.14, hook .10–.44, body .38–.70, CTA .64–.88, outro .84–1, each bound to its draw function and the job context.
- `sceneAlpha` [complete/high]: Blend weight of a scene at global progress t: 0 outside its window, with a linear fade in and out near the edges.
- `drawFrame` [complete/high]: Render one full frame. Draw the dominant (highest-alpha) scene directly, then overlay other active scenes via offscreen canvases at their alpha. Add platform chrome, then the color grade, vignette and grain stack, then a black global fade in and out at the start and end.
- `renderMaxcoreVideo` [complete/high]: Public entry point. It sizes the canvas (duration clamped to 3–60s, longest side capped at 1280), builds the palette, scenes and grain, and picks a supported MediaRecorder mime type. It then draws frames in real time while recording, reports progress, supports abort via signal, and returns a blob URL with a revoke function.

### `docs/archive/production-variants-2026-08/history/scripts-and-config/scripts/deployment-autofix.mjs/deployment-autofix--54df3b7864e9.mjs`

A fail-closed deployment-time gate script. It validates an error-research playbook, applies official ESLint --fix, then for the server and client TS configs runs a verify phase of scripts/fix-all.mjs, applies position-verified fix handlers if verification fails, and re-verifies. It finishes with a quiet lint check. Any unresolved diagnostic exits non-zero so the deployment is not promoted.

- `run` [complete/high]: Run a child process synchronously with inherited stdio, a 4GB Node heap, and a timeout, and return a numeric exit code. A timeout maps to 124, a null status maps to 1, and other spawn errors are rethrown.
- `verify` [complete/high]: Run the fix-all 'verify' phase for one TypeScript config (server or client) to check for remaining diagnostics, i.e. a fresh split typecheck.
- `apply` [complete/medium]: Run the position-verified fix-all handlers for a config's TypeScript diagnostics, reading the captured typecheck output from reports/fix-all/tc-<config>.txt.

### `docs/archive/production-variants-2026-08/history/scripts-and-config/scripts/deployment-autofix.mjs/deployment-autofix--7efb934770bc.mjs`

Archived copy of a deployment-time, fail-closed repair and verification gate script. It validates an error playbook, runs ESLint --fix, then for the server and client configs runs a fix-all verify phase, applies position-verified TypeScript handlers if verification fails, and re-verifies. It ends with a quiet lint check and exits non-zero on any unresolved problem so deployment is not promoted.

- `run` [complete/high]: Run a child process synchronously with inherited stdio and a raised Node heap limit, logging a labelled banner, and return its exit status for callers to branch on.
- `verify` [complete/high]: Run the fix-all verification phase (fresh typecheck diagnostics) for a given TypeScript config (server or client) and report its exit status.
- `apply` [complete/high]: Apply the position-verified TypeScript fix handlers for a config, using the diagnostics file previously produced by the verify phase as input.

### `external/maxcore/artifacts/ai-dashboard/src/pages/training.tsx`

React admin dashboard page for monitoring and controlling model training. It shows live training status and logs, starts and stops runs with hyperparameters, controls continuous training and a data puller, and manages the audio dataset (top-up seeding). All control calls go to /api with an optional admin key header.

- `authHeaders` [complete/high]: Build the admin-auth header object for API requests. It adds X-Admin-Key when an admin key is present and returns an empty object otherwise.
- `apiFetch` [complete/high]: Thin fetch wrapper that prefixes the path with /api, throws on a non-OK HTTP status, and parses the response as JSON.
- `Training` [complete/high]: Default-exported page component for the training dashboard. It polls training status and logs, starts or stops a run with configurable epochs, batch size and learning rate, and controls continuous training and the data puller. It also shows audio dataset status with a source selector and a 'Top Up' seeding action, and renders a log terminal with auto-scroll.
- `Training.isRunning` [complete/high]: Predicate that reports whether a training state string equals 'running'. It is used to gate UI controls and choose polling intervals.
- `Training.handleScroll` [complete/high]: Scroll handler for the log container. It enables auto-scroll when the user is within 40px of the bottom and disables it when the user scrolls up, so the view does not jump while the user reads older logs.

### `external/maxcore/artifacts/ai-training-server/ai_model/director/analytics.py`

Implements the analytics feedback loop for the AI director: records observed engagement performance of deployed content (PerformanceRecord) via pluggable backends (JSONL file, PDIM storage with file fallback) and derives simple performance hints per platform to inform future generation.

- `PerformanceRecord` [complete/high]: Dataclass representing observed performance (impressions, engagements, completion rate, CTR, timestamp) for a deployed piece of content on a platform/modality.
- `PerformanceRecord.engagement_rate` [complete/high]: Computed property giving engagements per impression, guarding against division by zero.
- `PerformanceRecord.to_dict` [complete/high]: Serialize the record to a plain dict for JSON persistence.
- `PerformanceRecord.from_dict` [complete/high]: Deserialize a record from a dict, ignoring unknown keys for forward/backward compatibility.
- `AnalyticsSource` [complete/high]: Protocol defining the pluggable analytics backend interface: get_recent and record.
- `AnalyticsSource.get_recent` [complete/high]: Protocol method: fetch recent performance records, optionally filtered by platform and modality, capped by limit.
- `AnalyticsSource.record` [complete/high]: Protocol method: persist a performance record and report success.
- `FileAnalyticsSource` [complete/high]: JSONL file-backed analytics store that works locally and survives restarts.
- `FileAnalyticsSource.__init__` [complete/high]: Set the storage path, defaulting to the module-level analytics file.
- `FileAnalyticsSource.get_recent` [complete/high]: Read the JSONL file, skip malformed lines, filter by platform/modality, sort newest first and truncate to limit.
- `FileAnalyticsSource.record` [complete/high]: Append a record to the JSONL file, stamping recorded_at if unset.
- `PdimAnalyticsSource` [complete/medium]: Production analytics source backed by PDIM key-value storage, with a file source as fallback and mirror.
- `PdimAnalyticsSource.__init__` [complete/high]: Create the fallback FileAnalyticsSource.
- `PdimAnalyticsSource._pdim` [complete/high]: Lazily obtain the PDIM storage client, returning None if unavailable.
- `PdimAnalyticsSource.get_recent` [complete/high]: Read records from PDIM, filter, sort newest first and truncate. Falls back to the file source on error or when PDIM has no data or is unavailable.
- `PdimAnalyticsSource.record` [complete/high]: Write a record to the file and also append it to the PDIM list, trimmed to the last 1000.
- `FeedbackLoop` [complete/high]: Facade that turns recorded performance data into generation hints and persists new feedback.
- `FeedbackLoop.__init__` [complete/high]: Store the given analytics source, or default to PdimAnalyticsSource.
- `FeedbackLoop.get_hints` [complete/high]: Compute string-valued hints for a platform from its 20 most recent records: average engagement rate of the top 5, sample size, top-performing modality, and bottom-5 average once at least 10 records exist.
- `FeedbackLoop.record_feedback` [complete/high]: Build a PerformanceRecord from a raw metrics dict and persist it through the source.

### `external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py`

A pure-Python/numpy emulation of the CUDA execution model for the 'digital GPU'. It provides dim3, per-block shared memory, warp shuffle/reduce primitives, atomics, math and fp conversion intrinsics, and a per-block CUDARuntime context. A launch_kernel helper loops over the grid and calls a vectorised Python kernel once per block. SM102 kernels are written against it. The module docstring says it is not a CUDA interpreter.

- `Dim3` [complete/high]: Models CUDA's dim3: an (x, y, z) triple for thread, block and grid dimensions.
- `Dim3.__init__` [complete/high]: Store x, y and z, defaulting each to 1.
- `Dim3.from_arg` [complete/high]: Coerce a launch argument (Dim3, int, or tuple/list) into a Dim3, mirroring CUDA's implicit dim3 construction for <<<grid, block>>>.
- `Dim3.__repr__` [complete/high]: Readable debug string for a Dim3.
- `Dim3.volume` [complete/high]: Return the total element count (x*y*z), such as threads per block.
- `SharedMemory` [complete/high]: Models the per-block __shared__ scratchpad as a fixed-size float32 numpy buffer.
- `SharedMemory.__init__` [complete/high]: Allocate a zero-filled float32 buffer of n_floats elements.
- `SharedMemory.view` [complete/high]: Return a writable slice view of the buffer, so kernels can take sub-arrays such as m_i = shm.view(0, T).
- `SharedMemory.__getitem__` [complete/high]: Index or slice read access to the buffer.
- `SharedMemory.__setitem__` [complete/high]: Index or slice write access to the buffer.
- `SharedMemory.reset` [complete/high]: Zero the whole buffer.
- `SharedMemory.nbytes` [complete/high]: Report the buffer size in bytes.
- `WarpState` [partial/medium]: Models one 32-lane warp and provides warp-level shuffle and reduction primitives.
- `WarpState.__init__` [complete/high]: Initialise a zeroed 32-lane float32 buffer, optionally preloaded with up to 32 values.
- `WarpState.load` [complete/medium]: Load up to 32 values into the warp's lane buffer.
- `WarpState.shfl_down_sync` [partial/high]: Emulate one step of the shfl_down butterfly reduction across 32 lanes. Each lane adds the value from lane+offset, and lanes whose source is out of range keep their own value.
- `WarpState.reduce_sum` [complete/high]: Compute a full warp horizontal sum via a log2(32) shfl_down loop with offsets 16, 8, 4, 2, 1.
- `_AtomicFloat` [dead/medium]: Thread-safe float32 scalar accumulator modelling atomicAdd on a scalar.
- `_AtomicFloat.__init__` [complete/high]: Initialise the float32 value and the lock.
- `_AtomicFloat.add` [complete/high]: Atomically add a delta to the accumulator.
- `_AtomicFloat.value` [complete/high]: Read the current value as a Python float.
- `_AtomicFloat.reset` [complete/high]: Reset the accumulator to zero under the lock.
- `atomic_add` [complete/high]: Emulate atomicAdd on an array element. It is a plain in-place add, justified by the single-threaded execution model.
- `CUDARuntime` [complete/high]: Per-block execution context handed to Python kernel functions. It exposes thread, block and grid indices, shared memory, sync, warp intrinsics, atomics, and math and fp conversion helpers in place of CUDA intrinsics.
- `CUDARuntime.__init__` [complete/high]: Store the Dim3 indices, optionally preallocate shared memory, and create a WarpState and an atomics registry.
- `CUDARuntime.shared` [complete/high]: Return the block's shared memory, allocating it, or reallocating it if the existing buffer is too small. This is the analogue of declaring __shared__ float[n].
- `CUDARuntime.syncthreads` [stub/high]: Stand-in for __syncthreads(). It is a no-op because each block executes sequentially and vectorised.
- `CUDARuntime.shfl_down_sync` [complete/medium]: Delegate the warp shuffle-down step to the WarpState.
- `CUDARuntime.warp_reduce_sum` [complete/high]: Convenience warp-wide sum, delegating to WarpState.reduce_sum.
- `CUDARuntime.atomic_add` [complete/high]: Method wrapper around module-level atomic_add.
- `CUDARuntime.rsqrtf` [complete/medium]: Emulate CUDA rsqrtf, the reciprocal square root.
- `CUDARuntime.expf` [complete/high]: Emulate CUDA expf using float32 precision.
- `CUDARuntime.fmaxf` [complete/high]: Emulate CUDA fmaxf, returning the max of two scalars.
- `CUDARuntime.float2half` [complete/high]: Convert an array to float16, like the CUDA float-to-half intrinsic.
- `CUDARuntime.half2float` [complete/high]: Convert an array to float32, like the CUDA half-to-float intrinsic.
- `launch_kernel` [complete/high]: Emulate a CUDA kernel launch. It iterates every block in the grid (z, then y, then x), builds a CUDARuntime per block, and calls kernel_fn(rt, *args) once per block. Threads are not iterated, because kernels are vectorised over them.

### `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py`

Defines the abstract Backend interface for the maxcore DigitalGPU runtime: a set of primitive kernel methods (tensor creation, gemm, add, relu, softmax, attention, conv2d, mlp, reduce) plus default capability and introspection helpers, so interchangeable backends can sit behind the public API and runtime.

- `Backend` [complete/high]: Abstract base class that is the contract every DigitalGPU backend (digital/CPU, GPU, cluster, ASIC) must implement. Subclasses override abstract kernels and may override availability, op support and info.
- `Backend.create_tensor` [stub/high]: Abstract: convert raw data into the backend's native tensor representation with a given dtype.
- `Backend.gemm` [stub/high]: Abstract: general matrix multiply a@b, with optional bias and fused activation.
- `Backend.add` [stub/high]: Abstract: elementwise addition of two tensors.
- `Backend.relu` [stub/high]: Abstract: elementwise ReLU activation.
- `Backend.softmax` [stub/high]: Abstract: softmax along the given axis (default last).
- `Backend.attention` [stub/high]: Abstract: scaled dot-product attention over q, k, v with an optional mask and a causal flag.
- `Backend.conv2d` [stub/high]: Abstract: 2D convolution with optional bias, stride and padding.
- `Backend.mlp` [stub/medium]: Abstract: fused two-layer MLP: act(x@w1+b1)@w2+b2.
- `Backend.reduce` [stub/high]: Abstract: reduction (e.g. sum, mean, max) over axes with optional keepdims.
- `Backend.is_available` [complete/high]: Default hook reporting whether the backend can run on this host; returns True. Hardware-dependent backends override it (e.g. the GPU backend's device checks).
- `Backend.supports` [complete/medium]: Default capability query saying whether the backend supports a named op; always True, and subclasses can restrict it.
- `Backend.info` [complete/high]: Return a small descriptive dict with the backend name and availability.

### `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py`

Declares honest, non-functional plug-points for backends (cluster, ASIC) that are not implemented on this host. Each reports unavailable and raises NotImplementedError with a contract describing what a real implementation must do, so the backend registry, runtime and API stay backend-agnostic.

- `_FutureBackend` [stub/high]: Abstract base for not-yet-implemented backends. It reports itself unavailable and makes every kernel op raise NotImplementedError with the subclass's contract text.
- `_FutureBackend.is_available` [complete/high]: Report that this backend cannot be used on this host, so registry selection skips it.
- `_FutureBackend._nyi` [complete/high]: Central helper that raises a NotImplementedError naming the backend, the op and the contract.
- `_FutureBackend.create_tensor` [stub/high]: Placeholder for the tensor-creation kernel; always raises NotImplementedError.
- `_FutureBackend.gemm` [stub/high]: Placeholder for the matrix-multiply kernel; always raises NotImplementedError.
- `_FutureBackend.add` [stub/high]: Placeholder for the elementwise add kernel; always raises NotImplementedError.
- `_FutureBackend.relu` [stub/high]: Placeholder for the ReLU kernel; always raises NotImplementedError.
- `_FutureBackend.softmax` [stub/high]: Placeholder for the softmax kernel; always raises NotImplementedError.
- `_FutureBackend.attention` [stub/high]: Placeholder for the attention kernel; always raises NotImplementedError.
- `_FutureBackend.conv2d` [stub/high]: Placeholder for the 2D convolution kernel; always raises NotImplementedError.
- `_FutureBackend.mlp` [stub/high]: Placeholder for the fused MLP kernel; always raises NotImplementedError.
- `_FutureBackend.reduce` [stub/high]: Placeholder for the reduction kernel; always raises NotImplementedError.
- `ClusterBackend` [stub/high]: Named plug-point for a future multi-node backend. Its contract text describes the intended design: partition the MaxCoreGraph across nodes over RPC, shard the KV-cache, and all-reduce at BARRIER ops.
- `ASICBackend` [stub/high]: Named plug-point for a future ASIC backend. Its contract text describes lowering MaxCore IR to ASIC microcode that drives DMA engines, an on-chip KV-cache and tensor units.

### `external/pdim/scripts/src/generate-patent.ts`

A one-shot script that uses pdfkit to generate a formatted US patent application PDF (cover page, specification, claims, abstract, declaration page, page-number footers) describing the hierarchical distributed storage system (Pocket Dimension, Fabric, Hybrid tiering, Redis-compatible store with WASM Lua, auto-push pipeline). It writes the file to ../attached_assets/patent_blawz_music_llc.pdf. The helpers are file-local layout primitives; all content is emitted at module top level on import/execution.

- `drawHR` [complete/high]: Draw a thin horizontal rule across the content area at a given y (or the current cursor y) for visual separation.
- `sectionTitle` [complete/high]: Render a major section heading: spacing, a rule, an uppercase bold accent-colored title, then reset to body font.
- `subSection` [complete/high]: Render a second-level bold dark-gray heading and restore the body font.
- `subSubSection` [complete/high]: Render a third-level bold-italic heading (e.g. '2.1 Pocket Isolation') and restore the body font.
- `body` [complete/high]: Render a justified body paragraph in 10pt Times with small trailing spacing; opts can override text options.
- `claimText` [complete/high]: Render a patent claim: a bold 'Claim N.' label followed by justified claim text on the same line.
- `bullet` [complete/medium]: Render a bullet-point item with a hanging indent: a '•' marker at the left margin and wrapped text at the indent.
- `numberedItem` [complete/medium]: Render a numbered list item (or 'FIG. N' label) with a hanging indent.
- `letterItem` [complete/high]: Render a lettered sub-item (a., b., …) nested under a numbered item with a deeper hanging indent.
- `addPageNumber` [partial/medium]: After all content is written, stamp a centered footer 'B-Lawz Music LLC — Patent Application — Page N' on every buffered page.
- `metaRow` [complete/high]: Render a label/value row on the cover page as a two-column table (label on the left, value on the right).

### `reports/aso/isolated-full-20261106T233139Z/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py`

(analysis failed: ValueError)


### `reports/test-verification/final-map-refresh/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py`

(analysis failed: ValueError)


### `reports/test-verification/final-plan-fix/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py`

(analysis failed: ValueError)


### `reports/test-verification/full-current/toolchains/rust-1.93.1/lib/rustlib/etc/lldb_providers.py`

(analysis failed: ValueError)


### `script/deployment/executive.mjs`

Deployment 'executive': a dependency-aware, resource-aware process scheduler used for the build and start phases of the deployment. It validates a task plan, adds mandatory build-phase ordering, spawns each task as a detached process group within live CPU, memory and I/O limits, and retries tasks on bounded signals. It also enforces a time budget, supervises application readiness, handles shutdown signals, and tears down whole process trees on exit. A CLI `main(mode)` is the entrypoint and runs only when the file is executed directly. Roughly the second half of the file is a block comment holding quarantined, malformed duplicates of `runExecutive` and `main`.

- `now` [complete/high]: Monotonic millisecond clock (performance.now) used for all deadline, backoff and elapsed-time arithmetic in the module.
- `signalGroup` [complete/high]: Send a signal to an entire POSIX process group (negative pid), ignoring groups that no longer exist.
- `liveGroup` [complete/high]: List the live (non-zombie, non-dead) processes whose process-group id equals the given pid, by scanning /proc.
- `bounded` [complete/high]: Run an async or sync operation with a timeout. Rejects with code DEPLOY_OPERATION_TIMEOUT if it does not finish within ms.
- `stopJob` [complete/high]: Reliably stop one task's whole process tree: first the owned-process tracker (which catches descendants in other sessions), then SIGTERM, then SIGKILL on the process group, verifying nothing survives.
- `bindShutdownSignals` [complete/high]: Translate SIGINT, SIGTERM and SIGHUP into an abort of the supplied AbortController, with an error carrying code and metadata. Returns an unbind function.
- `bindShutdownSignals.handler` [complete/high]: Per-signal listener that aborts the controller once with a descriptive error.
- `validatePlan` [complete/high]: Validate the structure of a task plan: task shape and numeric ranges, optional retry and timeout fields, unique ids, and an acyclic dependency graph with known prerequisites.
- `validatePlan.visit` [complete/high]: Depth-first traversal that rejects unknown prerequisites and dependency cycles.
- `coordinateBuildPlan` [complete/high]: Return a copy of the build plan with mandatory phase ordering edges injected, so that critical build phases always run in the required sequence regardless of the declared deps.
- `runExecutive` [complete/high]: Core scheduler. It runs a validated plan as child processes, respecting dependencies, live resource capacity, a total budget and per-task timeouts. It handles retries on SIGTERM/SIGHUP, abort signals and the readiness probe, and always drains children on exit.
- `runExecutive.rank` [complete/high]: Memoised critical-path priority: 1 plus the maximum rank of successor tasks.
- `runExecutive.checkpoint` [complete/high]: Snapshot the per-task state (completed, running, failed, retry-backoff or waiting) for diagnostics on failure.
- `runExecutive.concurrentlyAdmissible` [complete/medium]: Estimate how many of the remaining eligible tasks (from index onward) could be started concurrently under the CPU, memory and I/O limits, so that free CPU can be fairly shared among elastic tasks.
- `runExecutive.abort` [complete/high]: Convert the external AbortSignal's reason into the executive's `failure` error and wake the scheduler.
- `runExecutive.notify` [complete/high]: Wake-up hook that interrupts the scheduler's poll sleep. It is an empty no-op by default and is reassigned to `finish` while waiting.
- `runExecutive.finish` [complete/medium]: Resolver for the poll-wait promise: clears the timer, resets notify and resolves.
- `main (active entrypoint)` [partial/medium]: CLI entrypoint for mode 'build' or 'start'. It builds and validates the plan, provisions a temp state dir, binds shutdown signals, computes the remaining budget, runs the executive, prints a checkpoint on failure, and cleans up.
- `main (quarantined copy #1)` [dead/high]: Commented-out earlier main that included root resolution, budget and timestamp validation and a mid-file splice of runExecutive text. It is not executed.
- `main (quarantined copy #2)` [dead/high]: Second truncated/malformed commented main, which breaks off mid-expression.
- `unbind (quarantined)` [dead/high]: Placeholder `let unbind = () => {}` inside the commented main, later assigned bindShutdownSignals' return value.
- `finish (quarantined duplicate)` [dead/medium]: Duplicate of the poll-wait resolver inside the commented-out copy of runExecutive.

### `script/lib/provisionPortablePython.mjs`

Provisions an isolated, pinned portable CPython (python-build-standalone 3.12.13, linux x86_64) into <root>/python_runtime. It downloads and validates the archive, extracts it to a staging dir, verifies the version, installs and verifies locked dependencies, then swaps the result in via rename with rollback. An existing runtime that passes verification is reused. It can run as a CLI script or be imported.

- `command` [complete/high]: Thin wrapper over spawnSync that runs an external command synchronously. It throws on spawn error or non-zero exit, including the last 2000 chars of stderr, and returns stdout as a string.
- `downloadArchive` [complete/high]: Downloads a URL to a local file using curl with hardened options: HTTPS only (including redirects), TLS 1.2+, fail on HTTP errors, 2 retries, connect timeout 15s, max time 180s.
- `validateArchive` [complete/high]: Sanity-checks the tarball before extraction. It must list python/bin/python3, and every member must be relative and rooted under python/. This rejects absolute paths and '..' traversal.
- `runRuntimeCheck` [complete/high]: Verifies that a Python runtime directory is usable. bin/python3 must be an executable regular file, its --version must equal the expected version, and the dependency installer script must pass in --verify-only mode.
- `replaceRuntime` [complete/high]: Swaps a staged runtime into the final location with rollback. An existing runtime is renamed to a unique backup, the staged one is renamed into place, and the backup is deleted on success. On failure the backup is restored.
- `provisionPortablePython` [complete/high]: Main entry point. It ensures <root>/python_runtime holds a verified portable Python of the expected version. It reuses the existing runtime if it passes the check. Otherwise it downloads, validates, extracts, version-checks, installs dependencies, verifies, and atomically replaces the runtime, cleaning up staging in all cases.

### `scripts/archive-august-production-variants.mjs`

One-off CLI tool that preserves the distinct August 2026 (2026-08-01 to 2026-09-01) versions of deployment entrypoints, npm deployment scripts, the .replit [deployment] section and deployment docs. It reads them from every reachable Git ref and writes them as non-executable, checksummed files under docs/archive/production-variants-2026-08/history with a manifest.json. It never touches the live production config and refuses to archive anything that looks like an embedded credential. Modes: dry-run (default), --write (create once), --rebuild (expand an existing archive without dropping variants), --verify (check archive checksums and that active files still match the saved baseline).

- `runGit` [complete/high]: Thin wrapper that runs `git` with the given args in the repo root and returns its stdout, as a Buffer by default or as a string when encoding is 'utf8'.
- `sha256` [complete/high]: Return the hex SHA-256 digest of a byte buffer or string.
- `getTrackedFileHashes` [complete/high]: Compute SHA-256 hashes of the current working-tree versions of the 'active' production files (ACTIVE_PATHS). The hashes form the baseline that proves the archiver did not modify live config.
- `extractDeploymentScripts` [complete/high]: Reduce a package.json blob to a deterministic JSON document containing only deployment-related script entries (names matching build/start/deploy/publish/release/prod/capsule or 'production'). This avoids archiving dependencies or other fields.
- `extractReplitDeploymentConfig` [complete/high]: Parse the .replit file's [deployment] section and keep only the allowlisted keys deploymentTarget, build and run, emitted as JSON. The rest of .replit is left out because it may hold sensitive or irrelevant data.
- `hasEmbeddedSecret` [partial/medium]: Heuristically decide whether a candidate archive file contains a hard-coded credential: private key blocks, user:password URLs for postgres/redis, sensitive-named assignments, literal credential CLI arguments, or inline env credentials. Archiving is blocked if one is found.
- `isPackageScriptsPath` [complete/high]: Predicate: is this relative path package.json (the file needing script extraction)?
- `getAugustCommits` [complete/high]: List every commit across all refs whose date falls within the August 2026 window.
- `scanAugustTrees` [complete/high]: For each August commit, list the blobs at the watched source paths (CODE_PATHS, DOCUMENT_PATHS, .replit) and dedupe them by (path, blob id), recording the first commit that exposed each variant.
- `classify` [complete/high]: Map a source path to an archive category: documentation, npm-scripts, launch-config or scripts-and-config.
- `archiveName` [complete/high]: Build a unique archived file name '<stem>--<first 12 hash chars><ext>' so multiple content versions of one path can coexist.
- `archivedFilePath` [complete/high]: Safely resolve a manifest-relative archive path ('history/...') to an absolute path inside HISTORY_ROOT. It guards against manifest tampering and path traversal.
- `buildArchivePlan` [complete/high]: Assemble the full archive plan. It lists August commits, scans their trees, fetches each blob, transforms package.json and .replit into sanitized extracts, rejects any variant with a probable secret, dedupes by path and content hash, and assigns archive paths and metadata.
- `serializeManifest` [complete/high]: Create the manifest object describing the archive: schema version, history window, commit and variant counts, the active-file baseline hashes, and per-file metadata without the content.
- `assertExistingArchiveCanExpand` [complete/high]: Guard for --rebuild. The existing archive must have a manifest and pass verification, must be a compatible schema and window, and the new plan must be a superset of the existing (sourcePath, sha256) variants. This ensures a rebuild only adds and never drops archived history.
- `writeArchive` [complete/medium]: Materialize the plan on disk. It writes all variant files and the manifest into a staging directory, then renames the staging dir into place as history/. When rebuilding, the old archive is backed up, swapped, and removed on success or restored on failure. Files are written 0644 so archived scripts are not executable.
- `verifyArchive` [complete/high]: Check archive integrity. Every manifest entry must have a safe path, exist as a regular file, match its SHA-256 and be non-executable. The current active production files must still match the baseline hashes in the manifest.
- `main` [complete/high]: CLI entry. It parses a single optional mode flag (--write, --rebuild or --verify) and validates usage. It confirms the script runs from the repo's git toplevel, then runs verify, write/rebuild, or the default dry-run report with per-category counts.

### `scripts/database-recovery-drill.mjs`

Executable script that performs a live database disaster-recovery drill. It takes a read-only, repeatable-read exported snapshot of the primary Neon Postgres database, dumps it with pg_dump, optionally retains the dump in private managed storage and reads it back, then restores into a disposable local PostgreSQL cluster. It verifies schema fingerprint, per-table row counts and content hashes, then writes sanitized Markdown and JSON reports and cleans up all scratch state.

- `run` [complete/high]: Run an external command synchronously (initdb, pg_ctl, psql) with a scrubbed environment and a timeout. Throws a sanitized error on non-zero exit and returns stdout.
- `tableInventory` [complete/high]: Collect all user tables (regular and partitioned) with exact row counts and a deterministic order-independent content hash per table, for source/target comparison.
- `schemaEvidence` [complete/high]: Produce a canonical fingerprint of schema definitions (relations/views, columns, types, constraints, indexes, functions, sequences, triggers, RLS policies) so source and restored schemas can be compared.
- `_identity_arguments` [dead/high]: Not a real function. It is a false inventory hit on the text 'pg_get_function_identity_arguments' inside the functions SQL string.
- `def` [dead/high]: Not a real function. It is a false inventory hit on SQL text (e.g. 'pg_get_functiondef(p.oid) AS definition').
- `mkdirSyncCompat` [complete/high]: Create a private (mode 700) directory for the Postgres Unix socket by shelling out to `mkdir -m 700`, avoiding extra imports.
- `sourceIdentityParts` [complete/high]: List the source URL's identifying components (host, user, password, database name) of length >= 3, so they can be redacted from diagnostics.
- `digest` [complete/high]: SHA-256 hex digest helper.
- `currentRecoverySource` [complete/high]: Establish the identity of the recovery implementation: sha256 over the key recovery source files and the git HEAD revision, for binding retained artifacts to the code that produced them.
- `escapeRegExp` [complete/high]: Escape regex metacharacters in a string so it can be used in a literal RegExp.
- `sanitizeDiagnostic` [complete/high]: Redact sensitive details (Postgres secrets via safePostgresDiagnostic, source identity parts, the temp path, the temporary port) from error text before it is thrown or reported.
- `quoteIdentifier` [complete/high]: Quote a SQL identifier by doubling embedded double quotes.
- `qualified` [complete/high]: Build a quoted schema.table reference from an inventory row.
- `recordCheck` [complete/high]: Record a named pass/fail check in the result and throw if it failed, aborting the drill.
- `commandEnv` [complete/high]: Build a minimal, deterministic environment for child processes (PATH, HOME=temp dir, LANG=C, TZ=UTC) with optional overrides, to avoid leaking secrets.

### `scripts/deployment-autofix.mjs`

A fail-closed deployment gate script. It validates the error-research playbook, applies official ESLint auto-fixes, then for the server and client TypeScript configs verifies typechecks, runs position-verified fix-all handlers if needed, and re-verifies. Finally it runs a quiet lint check. Any unresolved failure exits non-zero so the deployment is not promoted.

- `run` [complete/high]: Run a child process synchronously with inherited stdio, a raised heap limit, and a timeout, and return a numeric exit code. A timeout maps to 124 (matching the `timeout` convention). A missing status maps to 1. Other spawn errors are rethrown.
- `verify` [complete/high]: Run the fix-all script's verify phase for a given TS config (server or client) to check that it typechecks cleanly.
- `apply` [complete/medium]: Run the fix-all script's position-verified TypeScript handler phase for a config, feeding it the previously generated typecheck output file (reports/fix-all/tc-<config>.txt).

### `scripts/maxcore-eval-browser.mjs`

A small CLI script that drives a dedicated, loopback-only Chrome DevTools Protocol (CDP) browser at 127.0.0.1:9224 for end-to-end evaluation of the app. Subcommands (login, goto, click, type, screenshot, eval-file) let an operator or agent log in with credentials from environment variables, navigate, interact with the page, capture screenshots and run JS, without credentials appearing in logs or files.

- `send` [complete/high]: Send a CDP command over the shared WebSocket and return a Promise that resolves with the command's result. Correlation uses an incrementing id and the `pending` map, which the ws.onmessage handler settles.
- `evaluate` [complete/high]: Run a JavaScript expression in the attached page via CDP Runtime.evaluate, awaiting promises and returning the result by value. Throws if the expression raised an exception.

### `scripts/readiness-assembled-acceptance.mjs`

Sealed, run-once acceptance harness for Max Booster's readiness work. It refuses to start if the environment holds sensitive config. It reserves ephemeral ports and builds a disposable local Postgres and app process. It then exercises the assembled app over HTTP (health, readiness, frontend, CSRF, register/login/logout, project CRUD), optionally authenticated HTTP load (`--http-load`), and a Chromium browser journey with an egress guard. Finally it writes JSON and Markdown evidence reports under reports/readiness-implementation/. Only the top of the file is visible, so the later parts are inferred from names and inventory line ranges.

- `reserveEphemeralPort` [complete/high]: Find a free TCP port on 127.0.0.1 by binding port 0, reading the assigned port, and closing the server. The port is then used for the disposable Postgres, the app, and the PDIM.
- `sanitizedLogTail` [complete/high]: Return a redacted tail of the app's log for failure reports. It prefers the longer of the in-memory tail and the persisted log file. It masks Postgres URLs and authorization/token/secret/password values, and keeps at most 12k chars.
- `run` [complete/high]: Synchronously run a child command (build, schema generation and similar steps) with an explicit environment. Throw a redacted error on non-zero exit.
- `request` [complete/high]: Make an HTTP request to the app on 127.0.0.1:appPort. It supports optional JSON body, cookie, CSRF header and method. It caps the retained response body at 256KB and still counts total bytes. In HTTP-load mode it rejects request bodies over 1024 bytes.
- `updateCookieJar` [complete/high]: Apply Set-Cookie headers to a Map-based cookie jar, storing name/value pairs and deleting a cookie when its value is empty.
- `cookieHeader` [complete/high]: Serialize the cookie jar into a Cookie header string.
- `jsonBody` [complete/high]: Parse a response body as JSON. Throw a descriptive error that includes the content type if parsing fails.
- `authRequest` [complete/high]: Cookie-jar-aware wrapper around request. It sends the jar's cookies with a 15s timeout and stores any returned Set-Cookie values back into the jar.
- `runHttpAuthJourney` [complete/high]: Verify the full HTTP auth lifecycle against the assembled app. It covers the CSRF bootstrap and cookie/body binding, registration (no password in the response), a synthetic paid entitlement set directly in the disposable DB, session persistence, logout, re-login, project CRUD, and final logout invalidation.
- `runProjectCrud` [unclear/medium]: Exercise project create, owned read, and update with optimistic concurrency (428 without expectedUpdatedAt, success with it, then a stale update check). The excerpt ends at the stale update, so the later steps (delete, cross-owner checks) are unseen.
- `fetchJsonFromPort` [unclear/low]: Fetch and parse JSON from a given local port, probably the browser's remote-debugging endpoint (DevTools /json) used by the browser journey.
- `runBrowserJourney` [unclear/low]: Drive a Chromium session (likely over CDP via the ws import) through the frontend and auth flows. It presumably includes a route sweep and an egress guard, and records the results in the evidence.
- `browserApi` [unclear/low]: Nested helper inside runBrowserJourney, presumably an in-page API/fetch wrapper used from the browser context. Exact role not visible.
- `navigateUntil` [unclear/low]: Nested helper that navigates the browser page until some condition holds, presumably a URL or readiness predicate with retries.
- `sweepRoutes` [unclear/low]: Visit a set of frontend routes in the browser and record their outcomes, such as errors or blank pages.
- `waitFor` [unclear/low]: Generic polling helper that waits until a predicate or condition succeeds, with a timeout.
- `sha256` [unclear/medium]: Compute a SHA-256 hex digest, likely of file contents or strings, for evidence reporting. createHash is imported.
- `memoryAdmissionSnapshot` [unclear/low]: Collect a snapshot of the app's memory or capacity-admission state for the capacityAdmission evidence, probably around the load test.
- `nearestRank` [unclear/medium]: Compute a percentile using the nearest-rank method, for latency statistics in the load test.
- `createLoadSession` [unclear/low]: Create an authenticated user session (register/login) for HTTP load workers, probably returning a cookie jar and CSRF token.
- `runAuthenticatedHttpLoad` [unclear/low]: Run bounded authenticated HTTP load against the app (the --http-load mode, with a request body cap of 1024 bytes). It computes latency percentiles and records the httpLoad evidence.
- `rejectPending` [unclear/low]: Reject all in-flight CDP command promises, likely when the browser socket closes or errors.
- `command` [unclear/low]: Send a CDP command over the WebSocket and return a promise for its response, tracking pending ids.
- `isContextTransition` [unclear/low]: Predicate that detects a browser execution-context transition, such as a navigation destroying the context, probably used to retry evaluate.
- `evaluate` [unclear/low]: Evaluate a JavaScript expression in the browser page through CDP and return its result, likely retrying across context transitions.
- `retainAppLogTail` [unclear/medium]: Append app stdout/stderr data to the in-memory appLogTail buffer, likely bounded, so sanitizedLogTail can report it.

### `scripts/readiness-beta-simulation.mjs`

Runs a sequential, allowlisted batch of isolated contract-test commands (node, vitest, python) under a cleared environment, a temporary HOME, a process-group timeout and a loopback-only network guard. It writes a JSON and Markdown 'beta simulation' report with per-command and per-domain PASS/FAIL/BLOCKED status. It explicitly makes no full-platform acceptance claim, and it snapshots the previous report before overwriting it.

- `preservePreviousReport` [complete/high]: Before a new run overwrites the latest report pair, copy any existing beta-simulation .json/.md into a unique timestamped+UUID history directory. Record a SHA-256 of each copy so earlier evidence is never lost.
- `add` [complete/high]: Register one allowlisted command in the module-level `commands` plan. Each entry records id, domain, executable, args, the input files to hash and check for existence, and extra env vars.
- `nodeTests` [complete/high]: Helper that registers a `node --test` command with single concurrency over the given test files, with optional node prefix args such as `--import tsx`.
- `vitest` [complete/high]: Helper that registers a single-worker, non-parallel vitest run through node_modules/vitest/vitest.mjs with a given config.
- `save` [complete/high]: Recompute per-domain status from the current results and the planned commands, then write the JSON and Markdown reports. It is called after every command so a partial run is still recorded.
- `run` [complete/high]: Execute a single planned command in isolation and return a result record. The record includes file hashes, bounded stdout/stderr, exit code, signal, timeout flag and status.
- `run.kill` [complete/high]: Kill the child's entire process group with SIGKILL, ignoring errors if it has already exited. Used for timeout and cleanup after close.

### `scripts/readiness-gauge/lib/checks.ts`

(withheld: contains a possible secret)


### `scripts/readiness-isolated-rehearsal.mjs`

A one-shot, self-contained release-gate script that rehearses the readiness schema and migrations against a throwaway PostgreSQL instance. It refuses to run if database or runtime environment variables are inherited. It generates Drizzle SQL from a temp copy of shared/schema.ts, starts a private Unix-socket-only Postgres, and applies the baseline SQL and the readiness migrations numbered 20 and above. It then checks table presence, Drizzle-vs-migration catalog parity, commerce ledger triggers, session/erasure repositories (via tsx sub-scripts), webhook dedup, and backup-catalog constraints and lease fencing. Finally it writes an immutable Markdown report, stops Postgres, cleans up, and sets the exit code. A pass is only an isolated beta gate and explicitly does not authorize production.

- `run` [complete/high]: Synchronous subprocess helper that runs a command in the repo root with the sanitized allowlisted env, a 120s timeout and captured output. It throws with the command, error and output on any non-zero status, and returns stdout.
- `digest` [complete/high]: Computes the hex SHA-256 of a text string so the report can record the exact schema and migration contents that were rehearsed.
- `check` [complete/high]: Runs a named async check and records PASS or FAIL in the report. A failure increments the failure counter and does not abort the run, so later checks still execute.
- `assert` [complete/high]: Minimal assertion helper that throws an Error with the given message when the value is falsy.
- `runStatus` [complete/high]: Reports whether the temporary PostgreSQL server is still running, by checking that `pg_ctl status` exits 0. The cleanup block uses it to avoid deleting the data directory while the server is still alive.
- `normalize (inner arrow in parity check)` [complete/high]: Turns catalog query rows into a sorted array of JSON strings so the SQL-migrated database and the Drizzle-generated database can be compared as sets.
- `snapshot` [complete/medium]: Names two different things. (1) The top-level const is a filesystem-safe ISO timestamp used to build a unique report filename. (2) An inner async function in the 'UPDATE journal identity' check serializes the ledger entries and journals tables to JSON so rows can be compared before and after a rejected update.

### `scripts/readiness-packed-acceptance.mjs`

A local, credential-free acceptance rehearsal for the packed (cold) release payload. It verifies the prepared release artifact, copies the payload and public model state into a temp dir, boots an ephemeral PostgreSQL, launches the packed runtime via start.sh with a loopback-only egress guard, polls health/readiness endpoints, records evidence JSON and logs, and always tears down owned processes and temp state. It never deploys.

- `run` [complete/high]: Synchronously execute a setup command (node, drizzle-kit, initdb, pg_ctl) with a given env and cwd, log its stdout/stderr to packed-setup.log, and throw if it exits non-zero.
- `port` [complete/high]: Obtain a free ephemeral TCP port on 127.0.0.1 by listening on port 0, reading the assigned port, and closing the server.
- `request` [complete/high]: Perform an HTTP fetch to the local runtime on a given port and route, with a timeout, parsing the body as JSON (or the first 200 chars of text), and report status, body and elapsed time.
- `wait` [complete/high]: Poll a route every 500ms until a predicate over the response holds or the timeout expires, aborting early if the packed app process has exited.
- `registryHash` [complete/high]: Compute the SHA-256 hex digest of a byte buffer, used to compare the platform optimization registry in the cold payload against the source checkout.

### `scripts/readiness-sast-scan.mjs`

Standalone CLI/library that produces independent local Semgrep SAST evidence (SCAN-05 'recovery evidence') for the repo's git-tracked first-party source. It builds a hashed inventory, stages the files into an isolated temp dir, fetches/materializes rule packs plus built-in coverage-probe rules, runs Semgrep with bounded resources, sanitizes the output (no matched source text), computes coverage and completeness, and writes JSON and Markdown reports. It has no gate effect.

- `sha256` [complete/high]: Return the hex SHA-256 digest of a string or Buffer.
- `slash` [complete/high]: Normalize OS-specific path separators to forward slashes.
- `extensionLanguage` [complete/high]: Map a file path to a language label used for coverage reporting, based on extension or Dockerfile basename.
- `excludedReason` [complete/high]: Decide whether a relative path belongs to a generated or excluded area and return a reason string for the exclusion tally.
- `isSource` [complete/high]: Check whether a path is a scannable source file by extension or Dockerfile name.
- `trackedFiles` [complete/high]: List repo files via git (tracked plus untracked-but-not-ignored), deduplicated.
- `buildInventory` [complete/high]: Build a deterministic, hashed manifest of in-scope first-party source files, counting excluded paths by reason.
- `isolatedScannerEnv` [complete/high]: Produce a child-process environment that keeps Semgrep isolated from host Python state and disables telemetry and version checks.
- `fetchBytes` [complete/high]: Download a URL over HTTPS with a limited number of redirects and a timeout, returning the body plus ETag and Last-Modified for rule provenance.
- `materializeRules` [complete/high]: Write each rule config (remote URL, local file or built-in bytes) to a temp YAML file and record provenance (digest, ETag, rule count). Always appends the built-in coverage-probe rules.
- `stageInventory` [complete/high]: Copy the inventoried files into an isolated staging directory, preserving relative paths, so Semgrep scans an immutable snapshot.
- `runBounded` [complete/high]: Run a child process with a wall-clock timeout (SIGTERM, then SIGKILL after 2s) and capped stderr capture, reporting the exit status.
- `normalizeStagedPath` [complete/high]: Convert absolute staged-root paths in scanner output to repo-relative forward-slash paths.
- `safeScannerError` [complete/high]: Convert a raw Semgrep error into a bounded, sanitized record that hides the temp stage path.
- `sanitizeSemgrep` [complete/high]: Reduce raw Semgrep JSON to a deterministic, content-free structure: deduplicated findings with fingerprints, errors, scanned paths and skipped paths.
- `severityCounts` [complete/high]: Tally findings by severity.
- `languageCoverage` [complete/high]: Compute per-language counts of inventoried, scanned and omitted files.
- `renderMarkdown` [complete/high]: Render the report object as a human-readable Markdown evidence document covering disposition, scanner and rules, coverage, findings table with P1/P2/P3 priorities, and incompleteness reasons.
- `runScan` [complete/high]: Orchestrate the whole scan: build the inventory, stage it, fetch rules, run Semgrep, sanitize the output, assess completeness, and write the JSON and Markdown reports. Cleans up the temp dir.
- `parseArguments` [complete/high]: Parse CLI flags (--root, --output-json, --output-md, --scanner) into runScan options.

### `scripts/simulate-production.mjs`

(withheld: contains a possible secret)


### `scripts/test-data-runtime.mjs`

Isolated boundary/integration test script for the Node/TypeScript data-runtime layer. It uses esbuild to bundle real server modules with their I/O dependencies (DB, Redis, BullMQ, storage, pg tools, child_process) replaced by in-memory mocks. It then asserts durability and fail-stop behavior of: the authoritative session store and revocation, the retention worker's quarantine of malformed jobs, the PDIM RedisStore recovery and legacy conversion, and the database backup service (backup, restore, shutdown drain). Many inventory 'symbols' are not real functions: they are mock source code inside template-literal strings, or small local helpers. The listed callers are spurious name collisions with Python files in other directories.

- `bundle` [complete/high]: Bundles a TS entry point with esbuild into a temp ESM file. A resolve plugin intercepts any import whose path matches a regex in `mocks` and serves the supplied JS source instead. The function then dynamically imports the result, so the real module runs against fake boundaries.
- `prepareConversion` [complete/high]: Test fixture writer: serializes the legacy snapshot, legacy AOF and stream export, hashes them with SHA-256, builds an approval JSON (instanceId, baselineSeq, hashes, freeze and streams-complete flags, expectedKeyCount), and writes all four to inputPaths. It is re-run after the fixtures are mutated.
- `selectPgDumpForServer` [complete/high]: Mock of postgresTools.selectPgDumpForServer, defined inside a template string. It records the selection and returns a fixed pg_dump 17 tool descriptor.
- `dumpedServerMajor` [complete/high]: Mock/replica of a helper that parses the 'Dumped from database version N' header from the first 8 KiB of a SQL dump and returns the major version. Throws if the header is missing.
- `dumpedServerVersion` [complete/high]: Mock helper that extracts the full 'major[.minor]' version string from the dump header. Throws if the header is absent.
- `selectPsqlForRestore` [complete/high]: Mock that selects a psql 17 tool for restore. It rejects any dumped major other than 17 and records the selection.
- `safePostgresDiagnostic` [stub/medium]: Mock identity-like diagnostic sanitizer that returns String(value).
- `spawn` [complete/high]: Mock child_process.spawn. It records the call, returns a fake EventEmitter process with PassThrough stdout and stderr, and on setImmediate emits a synthetic pg_dump output (with a 'Dumped from database version 17.11' header) or empty output, followed by 'close' with backupTest.exitCode (default 0).
- `sql` [complete/high]: Mock of the drizzle-orm `sql` tagged template. It returns {strings, values} so tests can inspect the query text.
- `sessionAuthority` [complete/high]: Mock of services/sessionAuthority.sessionAuthority (one of two same-named occurrences, L41 and L92). It is an async factory that returns globalThis.testAuthority, so tests control validate and revoke.
- `readSession` [complete/high]: Local test helper that promisifies store.get('sid', cb). It resolves with the session data or rejects with the error.
- `getRedisClient` [complete/high]: Mock of the Redis client getter. It throws 'No transient revocation permitted', asserting that session revocation never touches Redis.
- `isPdimConfigured` [complete/high]: Mock of the PDIM-configured check; always returns false so the PDIM path is disabled in the revocation tests.
- `newBullMQRedisConnection` [stub/high]: Mock returning an empty object as a BullMQ Redis connection, so the worker can be constructed without Redis.
- `flushFeatureEvents` [stub/high]: Mock async no-op for the feature event flush job. It lets the valid 'feature-event-flush' job succeed.
- `encode` [stub/high]: Mock @msgpack/msgpack encode, a no-op, so RedisStore can be loaded without the real dependency. Recovery tests use JSON, not msgpack.
- `decode` [stub/high]: Mock @msgpack/msgpack decode, a no-op counterpart to encode.
- `deferred` [complete/high]: Test helper that creates a manually controllable promise, returning {promise, resolve, reject}. It is used to gate upload and renewal hooks.
- `tick` [complete/high]: Test helper that yields one macrotask turn (setImmediate), letting pending async work flush.

### `scripts/testing/generation-reliability-gate.mjs`

A safety-gated, end-to-end reliability gate for MaxBooster's AI generation paths (social, shared, and advertising; text, image, audio, video). It runs only against an explicitly allowed localhost or Replit-dev origin, using a dedicated non-admin test account and a non-production provider receipt. It checks readiness, calls each generation endpoint, and verifies the output: text substance, provenance, durable owner-scoped media receipts, decodable and non-blank media via ffprobe/ffmpeg. It then deletes the generated artifacts and jobs. It prints a JSON PASS/FAIL/BLOCKED report and exits 0, 1, or 2.

- `emit` [complete/high]: Print the final JSON report (schema version, timestamp, mode, readiness, aggregate result, per-path rows) and set the process exit code.
- `modalityFor` [complete/high]: Look up a matrix path's modality by id.
- `mediaCleanupIsSupported` [complete/high]: Report whether MaxCore advertises both owner-scoped artifact storage and verified cleanup for the case's modality, so a media case can run without orphaning output.
- `parseProviderReceipt` [complete/high]: Parse and validate the env-supplied provider receipt, which proves a non-production provider and has not expired.
- `isAllowedOrigin` [complete/medium]: Safety check that the target base URL exactly matches the declared allowed origin and is localhost, 127.0.0.1, ::1, or a *.replit.dev host. Production (*.replit.app) and everything else is refused.
- `run` [complete/high]: Main gate orchestration. It checks health, readiness, and awareness freshness, bootstraps CSRF, logs in as the dedicated account, and confirms identity and non-admin role. It reads generation capabilities, selects runnable cases, runs each, and records PASS/FAIL/BLOCKED rows. In finally it deletes generated artifacts and jobs and downgrades PASS rows if cleanup cannot be verified. It then emits the report with exit code 1, 2, or 0.
- `request` [complete/high]: Nested HTTP helper inside run. It performs an authenticated JSON fetch against the allowed base with cookies, an optional CSRF header, a 120s timeout, and redirect:'error'. It reads the body with a size cap and parses JSON.
- `runCase` [complete/high]: Nested in run. Executes one scenario by id and returns a human-readable outcome string. It covers social URL flows (text, plus media through the multimodal endpoint), social direct text, shared text, advertising text, shared media, advertising image, and advertising video. It validates outputs and queues artifacts and jobs for cleanup.
- `getSourceUrl` [complete/high]: Resolve and validate the external source page used for URL-based social generation. It must be public HTTPS and outside the app's own domains.
- `mediaRequest` [complete/high]: Build the path and request body for the shared image, audio, or video generation endpoint, with small deterministic parameters (2s, 360x640).
- `validateMediaReceipt` [complete/high]: Assert that a shared-media response satisfies the durable artifact receipt contract: success, durable delivery, validation, a matching job_id, positive size, a sha256, an owner-scoped URL, dimensions for image and video, and duration for audio and video.
- `readArtifact` [complete/high]: Download a generated artifact from owner storage via the app's storage route, after verifying that the URL maps to the isolated account's key.
- `validateMediaBytes` [complete/high]: Verify artifact bytes are real, playable media. Images must have an image/* content type, nonzero dimensions, and non-blank decoded pixels. Audio must have a positive duration and an audio stream. Video must have a positive duration, a video stream, and at least 2 frames.
- `probeMedia` [complete/high]: Create a private temporary directory, probe the bytes with ffprobe, and always remove the directory.
- `probeWrittenFile` [complete/high]: Write the bytes to a temp file, run ffprobe (with frame counting), and parse the stream and format info. For audio, decode with ffmpeg and reject silent output.
- `decodeImagePixels` [complete/high]: Decode the first frame of an image with ffmpeg to raw rgb24 and check that it is not blank, meaning the value range exceeds 2.
- `storageKey` [complete/high]: Convert an artifact URL into a safe storage key, but only when it is same-origin, uses a known storage route, and lies in the test owner's generated, generated-images, or videos prefixes.
- `storagePathForKey` [complete/high]: Map an owner-scoped key to the API paths for get and delete, and say whether to verify absence after deletion. Hybrid storage is used for videos, and regular storage with permanent=true for generated assets.
- `extractText` [complete/high]: Recursively collect text from API response objects, looking at common text-bearing field names to a depth of 5, and join with newlines.
- `visit` [complete/high]: Recursive helper nested inside extractText. It walks arrays and whitelisted object keys and collects trimmed non-empty strings, to a depth limit of 5.
- `assertSuccess` [complete/high]: Classify an HTTP response. OK responses with success=false throw Error. Non-OK responses throw GateBlocked for external unavailability (401, 403, 429, 502, 503, 504, or unavailable/not-ready codes), and Error otherwise.
- `pollJob` [complete/high]: Poll the audio or video job status endpoint every 1s for up to 120s until done, failing on terminal error states or unknown statuses.
- `encodeStorageKey` [complete/high]: URL-encode each path segment of a storage key while preserving the slashes.
- `readBoundedBody` [complete/high]: Read a fetch response body stream up to a byte limit, cancelling and throwing if the limit is exceeded.
- `mergeCookies` [complete/high]: Merge Set-Cookie values into a cookie header string, with later values overriding by name.
- `normalize` [complete/high]: Normalize text (NFKC, collapsed whitespace, trimmed, lowercased) so it can be compared, to detect prompt echoing.
- `safeReason` [complete/high]: Produce a log-safe failure reason. GateBlocked messages are used as-is, Error messages are truncated to 240 characters, and anything else gets a generic message.

### `scripts/testing/page80-acceptance.mjs`

Sealed end-to-end acceptance harness for the Max Booster app ("page80"). It must run under `env -i` with no inherited secrets, and it refuses to start if sensitive env vars are present. It reserves ephemeral ports for Postgres, the app and PDIM. It starts a disposable local Postgres and the app, then checks health, readiness, frontend, HTTP auth/CRUD journeys, an authenticated HTTP load run and a Chromium browser journey. It records evidence, failures and observations to JSON and Markdown reports under reports/test-verification/integration-browser/page80, and `--http-load` skips the browser. Only part of the file is visible. Several symbols below are inferred from their names and inventory line ranges alone.

- `reserveEphemeralPort` [complete/high]: Obtain a free TCP port on 127.0.0.1 by binding to port 0, reading the assigned port, and closing the listener. The port is then handed to the Postgres, app and PDIM child processes.
- `sanitizedLogTail` [complete/high]: Return a redacted tail of the app's log for failure reports, so credentials do not leak into the report files.
- `run` [complete/high]: Run a child command synchronously (for example schema generation or Postgres setup), and throw a sanitized error if it exits non-zero.
- `request` [complete/high]: Make a single HTTP request to the local app on appPort. It simulates an HTTPS proxy and optionally sends a JSON body, cookie, CSRF token or client IP.
- `updateCookieJar` [complete/high]: Apply Set-Cookie headers to a Map-based cookie jar, as a minimal client cookie store.
- `cookieHeader` [complete/high]: Serialize the cookie jar into a Cookie request header value.
- `jsonBody` [complete/high]: Parse a response body as JSON, throwing a descriptive error that includes the content type if the body is not JSON.
- `authRequest` [complete/high]: Request wrapper that attaches the jar's cookies and the per-jar spoofed client IP, then updates the jar from the response Set-Cookie headers.
- `runHttpAuthJourney` [complete/high]: Exercise the full HTTP auth lifecycle against the app: CSRF bootstrap, register, session persistence, logout, login, project CRUD, and final logout. It grants a paid entitlement directly in the disposable DB.
- `runProjectCrud` [unclear/medium]: Verify project create, read, optimistic-concurrency update and presumably delete, for the authenticated owner.
- `fetchJsonFromPort` [unclear/low]: Likely fetches and parses JSON from an arbitrary local port, for example the PDIM or health endpoint.
- `runBrowserJourney` [unclear/low]: Drive a Chromium-based browser journey, probably over CDP via WebSocket, covering UI flows and the route sweep. Skipped in --http-load mode.
- `browserApi` [unclear/low]: Probably a helper that calls the app's API from within the browser context.
- `navigateUntil` [unclear/low]: Probably navigates the browser to a URL and waits until a condition holds.
- `sweepRoutes` [unclear/low]: Probably visits a set of client routes in the browser and records failures or observations for each.
- `waitFor` [unclear/low]: Probably a polling helper that waits for a predicate, such as a process becoming healthy or ready, with a timeout.
- `sha256` [unclear/medium]: Hex digest helper using createHash (imported from node:crypto), likely for fingerprinting data.
- `memoryAdmissionSnapshot` [unclear/low]: Probably captures a memory or capacity admission snapshot, for example of the app or host, for the capacityAdmission evidence.
- `nearestRank` [unclear/medium]: Probably computes a percentile by the nearest-rank method, used for load-test latency stats.
- `createLoadSession` [unclear/low]: Probably creates one authenticated load-test client, with a cookie jar and a unique spoofed IP, by registering and logging in.
- `runAuthenticatedHttpLoad` [unclear/low]: Probably runs the bounded authenticated HTTP load phase, enabled by --http-load, collecting latency percentiles and setting evidence.httpLoad.
- `rejectPending` [unclear/low]: Probably rejects all in-flight browser-protocol (CDP) command promises when the socket closes or errors.
- `command` [unclear/low]: Probably sends a CDP command over the WebSocket and returns a promise for the response, with timeout and pending tracking.
- `isContextTransition` [unclear/low]: Probably a predicate that detects a CDP error caused by an execution-context change during navigation, so the call can be retried.
- `evaluate` [unclear/low]: Probably evaluates a JavaScript expression in the browser page via CDP Runtime.evaluate, with retry on context transitions.
- `retainAppLogTail` [unclear/medium]: Probably appends app stdout/stderr chunks to the in-memory appLogTail, trimmed to a bounded size, for later sanitizedLogTail use.

### `scripts/verify-native-analysis.ts`

A standalone, non-production live verification script that exercises the MaxCore Node-to-Python analysis bridge. It sends synthetic media (ffmpeg-generated image, video, audio, plus text and website inputs) to a local MaxCore server. It checks auth rejection, owner isolation, SSRF blocking, response schema, and real measurements, then cleans up scratch files and uploads.

- `request` [complete/high]: POST a JSON body to `${origin}/api/analysis/<path>` with trusted MaxCore headers (user-id actor), allowing extra header overrides. Uses a 90s timeout and manual redirect handling, and returns the raw Response so callers can assert on status.
- `analyze` [complete/high]: Call an analysis endpoint and assert the standard response envelope (HTTP 200, schema_version 1, source 'maxcore_native_analysis', matching kind, string method, limitations array). Returns only the inner `analysis` payload for further assertions.
- `upload` [complete/high]: Upload a local file as scratch analysis input via `/api/analysis/upload?kind=...`. Asserts that the returned URL lies under the per-owner directory (sha256 of the actor) with a hex filename, records it for later cleanup, and returns the URL.
- `check` [complete/high]: Record and print a passing verification step. It increments the module-level pass counter and logs 'PASS <name>', and is called after each group of assertions succeeds.

### `server/lib/cronScheduler.ts`

A dependency-free replacement for node-cron. It parses 5-field cron expressions, computes the next fire time in an IANA timezone by scanning minute by minute with Intl.DateTimeFormat, and runs callbacks with a self-rescheduling setTimeout. The default export exposes the node-cron-style `{schedule, validate}` surface. Reading the code, the next-fire computation has correctness problems in its day-matching and skip-ahead logic (see nextExecution).

- `parseField` [complete/high]: Parse one cron field (comma list of `*`, `n`, `n-m`, `*/k`, `n-m/k`, `n/k`) into a Set of allowed integers within [min,max]. Throws on out-of-range, malformed or zero-step input.
- `parseCron` [complete/high]: Validate and parse a 5-field cron expression into per-field value sets (minute 0-59, hour 0-23, dom 1-31, month 1-12, dow 0-6).
- `getFormatters` [complete/high]: Return cached Intl.DateTimeFormat instances (numeric parts and short weekday) for a timezone, avoiding repeated construction on the hot path.
- `getLocalFields` [complete/high]: Convert an absolute Date into the wall-clock minute, hour, day of month, month and day of week in the given timezone.
- `nextExecution` [partial/medium]: Find the next minute after afterDate whose local fields match the parsed cron, scanning up to 2 years ahead. Returns null if none is found.
- `CronTask` [complete/medium]: ScheduledTask implementation. start() computes the next fire time and arms a setTimeout. On firing it reschedules first, then runs the callback asynchronously with errors swallowed. stop() clears the timer.
- `schedule` [complete/high]: Public factory: create a cron task for an expression and callback. It is started immediately unless opts.scheduled === false. It mirrors node-cron's `schedule`.
- `validate` [complete/high]: Return true if a cron expression is syntactically valid, without scheduling anything.

### `server/lib/localPdimServer.ts`

(analysis failed: ValueError)


### `server/lib/stripeClient.ts`

Central Stripe SDK helper for the server: selects the environment-appropriate Stripe secret/publishable keys, validates credential strings, offers a lazily-constructed and cached Stripe client that throws a 503-style error when unconfigured, and builds Stripe clients that optionally route through an HTTPS proxy while restricting the destination to api.stripe.com:443 and forcing Bearer authorization.

- `getStripeSecretKey` [complete/high]: Return the one Stripe secret key appropriate for the current runtime (production vs non-production) by delegating to shared selection logic.
- `getStripePublishableKey` [complete/high]: Return the publishable Stripe key for the current runtime, safe to send to the browser.
- `hasStripeCredential` [complete/high]: Type guard checking a value is a non-empty, untrimmed-whitespace-free, single-line string usable as a Stripe credential. Deliberately does not check key prefix or prove validity.
- `StripeUnavailableError` [complete/high]: Error type signalling Stripe is not configured, carrying HTTP 503 status and a code so handlers can map it to a service-unavailable response.
- `lazyStripeClient` [complete/high]: Return a getter that resolves a Stripe client only when called, so importing billing modules doesn't require Stripe config; caches the client and rebuilds it if the credential changes.
- `createStripeClient` [complete/high]: Construct a Stripe SDK client; if HTTPS_PROXY is set, use a custom HTTP client through the proxy that only permits api.stripe.com:443 over https and replaces Authorization with a Bearer secret.

### `server/middleware/apiCache.ts`

Two-tier (in-process L1 plus PDIM-backed L2) API response cache for the Express server. It exposes a singleton `apiCache` and a GET-caching middleware that is limited to authenticated, authorized, non-sensitive routes. It also provides a mutation middleware that invalidates a user's entries and a path pattern. Cross-pod L1 invalidation uses an adaptive PDIM polling loop plus per-user 'bust' timestamps. PDIM has no pub/sub, so polling stands in for it, and the bust timestamps guard against delayed-write races.

- `generateETag` [complete/high]: Produce a cheap, deterministic ETag string for a response body so clients can revalidate with If-None-Match and receive a 304.
- `extractUserIdFromRequest` [complete/high]: Get a stable user identifier from an Express request for cache keying and invalidation. It falls back to the literal 'anon' when no authenticated user is attached.
- `cacheMiddleware` [complete/medium]: Build an Express middleware that serves cached JSON for GET requests and populates the cache from successful JSON responses. It is deliberately conservative: it caches only for authenticated users, only when the caller supplies an `authorize` callback that passes on every request, and never for sensitive paths. Excluded paths are marketplace/storage/storefront entitlement-gated assets, auth/CSRF/bootstrap/social-callback routes, public press-kit and /api/v1 routes. Responses that set cookies are never cached.
- `cacheMiddleware.<jsonOverride> (cachedJson)` [complete/high]: Replacement for res.json that stores a successful (2xx, no Set-Cookie) JSON body in apiCache with an ETag and cache headers, then delegates to the original res.json.
- `invalidateCacheOnMutation` [complete/medium]: Build an Express middleware that, on mutating requests (POST/PUT/PATCH/DELETE), evicts the acting user's cached entries and entries whose key matches the request's base path, across pods via apiCache.

### `server/routes/maxcore.ts`

Admin-only Express router that remotely controls the 'MaxCore' AI training machine. It forwards control, status, log, training, model, dataset and knowledge calls to the peer, either over plain HTTP or through a PDIM (Redis-like) exec endpoint used as an RPC bus. It also writes local stop-flag files for the downloader and supervisor processes, and pushes download and AI job payloads onto the main PDIM queues.

- `parsePeer` [complete/medium]: Parse the peer configuration string into a PDIM config (`pdim://TOKEN@host/path` becomes an `https://host/path/exec` URL plus a bearer token) or an HTTP config. Falls back to http://localhost:8000 when the string is empty or not PDIM.
- `pdimExec` [complete/high]: Send a single Redis-style command (cmd, args) to a PDIM HTTP exec endpoint with bearer auth and a timeout, and return the result.
- `pdimRpc` [complete/high]: Implement request/response RPC over PDIM. It LPUSHes a job onto maxcore:rpc:in, then polls maxcore:rpc:out:<reqId> every 500ms until a reply arrives or the timeout expires. It returns a normalized {ok,status,data}. On timeout it returns 202 'queued'; on error it returns 503.
- `httpPeer` [complete/high]: Perform a JSON HTTP request to the MaxCore peer base URL, optionally with a bearer key and body, and normalize the result. Timeout or connection-refused errors are reported as 503 'offline'; other errors as 500.
- `peer` [complete/high]: Unified dispatch to the peer. In PDIM mode it converts the REST call into an RPC action named 'METHOD:/path'. Otherwise it calls httpPeer.
- `send` [complete/high]: Write a normalized peer result to an Express response. On success it sends 200 with the data; on failure it sends the result's status code with the data.
- `requireAdmin` [complete/high]: Express middleware that allows only authenticated users with role 'admin'. It returns 401 if the request is unauthenticated and 403 if the user is not an admin.
- `mainPdimPush` [complete/high]: RPUSH a JSON payload onto a list key in the main PDIM instance via its HTTP exec endpoint, so MaxCore can pull the job later.
- `ensureCtrl` [complete/high]: Make sure the local control/ directory exists, since stop-flag files are written there.

### `server/services/advancedUrlParser.ts`

(analysis failed: ValueError)


### `server/services/audioGeneratorService.ts`

Generates standalone MP3 audio with FFmpeg: a genre-specific procedural music bed (bass, beat and pad via aevalsrc), optionally mixed with a TTS voiceover. The MP3 is rendered to a temporary scratch file, uploaded to PDIM-backed storage, and deleted. Returns a download URL.

- `resolveFFmpegPath` [complete/high]: Locate the FFmpeg binary once at module load. Order: FFMPEG_PATH env var, `which ffmpeg`, a list of known Nix/Linux paths, then bare "ffmpeg" relying on PATH.
- `tryGenerateTTS` [complete/high]: Best-effort voiceover synthesis to a WAV file. Tries espeak-ng, then espeak, then FFmpeg's flite lavfi source. Returns null if every engine fails, so the caller falls back to a music-bed-only render.
- `generateAudio` [complete/high]: Main exported entry point. Builds a genre-calibrated music bed with optional TTS voiceover via FFmpeg, encodes it to a 192k MP3, uploads it to storage, and returns the download URL. The scratch file is always removed.
- `generateAudio.buildFilter` [complete/high]: Builds the FFmpeg filter_complex string. It mixes the three procedural sources, applies volume and fades, and optionally mixes in the voiceover (voice weight 1.0, bed 0.28, so the bed is ducked).
- `generateAudio.build` [complete/high]: Assembles the full ffmpeg argument array for rendering the output MP3, for either the voiced or the music-only variant.

### `server/services/backup/databaseDump.ts`

Runs pg_dump against a source Postgres database with bounded size, time, and diagnostics, writes output to a private temp file, reads it back, validates the dumped server major version against the queried server major, and returns the bytes with a sha256 checksum. The result is explicitly marked 'uncommitted' so callers must persist and restore-verify it separately. It also handles child termination escalation (SIGTERM, then SIGKILL) and temp-file cleanup.

- `databaseDumpChecksum` [complete/high]: Compute the hex SHA-256 digest of a dump buffer.
- `generateUncommittedDatabaseDump` [complete/high]: Produce a pg_dump of the source DB as an in-memory buffer plus metadata (checksum, size, source major/version), explicitly flagged as not durable or verified. It enforces size and time limits, optionally pins an exported snapshot, and always attempts temp-file cleanup.
- `generateUncommittedDatabaseDump.clearTerminationTimers` [complete/high]: Cancel the pending SIGTERM->SIGKILL escalation and the kill-confirmation timers.
- `generateUncommittedDatabaseDump.check` [complete/high]: Settlement state machine for the dump promise. It resolves when the stream and child are both closed, the stream finished, and the exit code is 0. Otherwise it rejects with the recorded failure once the stream is closed and the child is closed or termination is exhausted.
- `generateUncommittedDatabaseDump.terminateChild` [complete/medium]: Stop the pg_dump child with escalation: SIGTERM, then SIGKILL after the grace period, then declare termination exhausted if it still has not closed after a second grace period.
- `generateUncommittedDatabaseDump.beginFailure` [complete/high]: Record the first failure, tear down the output stream and child, and re-evaluate settlement.

### `server/services/backup/databaseRestore.ts`

Runs a database restore by spawning psql (or a similar command) against a target Postgres URL in a restricted, non-shell child process. It enforces a hard timeout with SIGTERM then SIGKILL escalation, caps captured stderr, and resolves only after the child process has closed, so the caller can safely delete its temporary SQL files.

- `runDatabaseRestore` [complete/high]: Spawn the restore command with sanitized args and environment, capture bounded stderr diagnostics, and return a promise that resolves on exit code 0 and rejects on non-zero exit, spawn or stream errors, timeout, or excessive diagnostics. It waits for confirmed process teardown before settling.
- `runDatabaseRestore.clearTimers` [complete/high]: Clear the deadline timer and any pending termination or kill escalation timers.
- `runDatabaseRestore.fail` [complete/high]: Record the first failure and begin terminating the child with SIGTERM, escalating to SIGKILL after the grace period. If the child still has not closed after a second grace period, reject with an AggregateError saying termination was not confirmed. Rejection normally happens in the close handler.

### `server/services/backup/postgresTools.ts`

Helpers for the backup/restore subsystem that locate PostgreSQL client binaries (pg_dump, psql) on PATH, probe their versions, ask the target server for its major version, and pick a client at least as new as the server. It also converts a Postgres URL into libpq environment variables so credentials stay out of argv, redacts secrets from diagnostics, and reads the source server version from a dump header so a restore can refuse an older target.

- `postgresConnectionEnvironment` [complete/high]: Translate a postgres:// or postgresql:// URI into libpq PG* environment variables, so child processes get connection settings and the password through env rather than the command line. Only a whitelist of query parameters is allowed.
- `safePostgresDiagnostic` [complete/high]: Make an error or value safe to log or embed in error messages by redacting database URLs and password=… fragments and truncating to 500 chars.
- `runBounded` [complete/high]: Spawn a child process and collect stdout/stderr with a hard timeout and a total output-size cap, rejecting and SIGKILLing the child if either is exceeded.
- `runBounded.collect` [complete/high]: Inner closure that appends a stdout/stderr chunk to the buffers and enforces the cumulative byte limit, killing the child on overflow.
- `parsePostgresClientVersion` [complete/high]: Extract the major and version string from `pg_dump --version` or `psql --version` output, e.g. '(PostgreSQL) 16.2'.
- `parseServerMajor` [complete/high]: Convert the output of `SHOW server_version_num` (e.g. 160002) into a major version number.
- `installedCandidates` [complete/high]: Discover executable copies of a tool by scanning PATH, resolving symlinks and de-duplicating, with limits to avoid pathological PATHs.
- `probePostgresTools` [complete/high]: Find all installed candidates of a tool and run `--version` on each, returning those that run successfully with parseable versions.
- `queryServerMajor` [complete/high]: Run `psql -c 'SHOW server_version_num'` against the database using a given psql binary and return the server's major version.
- `serverMajorWithAvailablePsql` [complete/high]: Determine the server major by trying each discovered psql client, newest first, until one succeeds.
- `compatibleTool` [complete/high]: Choose the best client for a server major: prefer an exact major match, otherwise the lowest major newer than the server.
- `selectPgDumpForServer` [complete/medium]: Pick a pg_dump binary compatible with the source database's server version for taking a backup.
- `selectPsqlForRestore` [complete/medium]: Pick a psql client for restoring a dump into a target database, refusing a target whose major is older than the dump's source major.
- `dumpedServerMajor` [complete/high]: Return the source server's major version recorded in a pg_dump SQL header.
- `dumpedServerVersion` [complete/high]: Parse the '-- Dumped from database version X[.Y]' line from the first 8KB of a plain-SQL dump.

### `server/services/multimodalGenerationService.ts`

Orchestrates multimodal content generation for Max Booster. It analyzes URLs and user context, normalizes a GenerationRequest, builds a task plan per platform, and runs text, image, audio and video workers. The workers call the external MaxCore AI service, validate the generated assets, and return a MultimodalPackage. The visible text-worker tail follows a MaxCore-only contract: if generation fails it throws AIUnavailableError and never falls back to local templates. Only a small part of the file is visible, so most entries below are inferred from names, inventory line ranges and imports.

- `safeErrorType` [complete/high]: Return a non-sensitive label for an unknown thrown value (the Error subclass name, or the typeof for non-Errors). Used in log lines so error messages that might contain secrets or URLs are not logged.
- `maxcorePost` [unclear/low]: Helper that POSTs a JSON request to a MaxCore API path. It likely uses MAXCORE_URL and MAXCORE_KEY and is the transport for the /generate/content calls. Only the signature start is visible.
- `sniffContentType` [unclear/low]: Likely detects a media content type from bytes or a header, probably by magic-number inspection, when the remote server's content type is missing or wrong. Body not visible.
- `absolutizeMaxCoreUrl` [unclear/low]: Likely converts a relative MaxCore media path into an absolute URL using the MaxCore origin.
- `isMaxCoreOrigin` [unclear/low]: Likely checks whether a URL belongs to the configured MaxCore origin, so that only trusted URLs are mirrored or sent the generation key.
- `mirrorRemoteAssetLocally` [unclear/low]: Likely downloads a remote (MaxCore) generated asset and stores it locally via storageService or the filesystem, so the package references durable local URLs.
- `emptyUserContext` [unclear/low]: Likely returns a default, empty user-context object (brand voice, autopilot preferences, releases) used when no user data is available or the fetch fails.
- `fetchUserContext` [unclear/medium]: Likely loads a user's autopilot preferences, brand voice and possibly releases from the DB to personalize generation, falling back to emptyUserContext.
- `matchReleaseByUrl` [unclear/low]: Likely finds which of a user's releases corresponds to a given URL, e.g. a streaming link.
- `classifyUrl` [unclear/low]: Likely classifies a URL by platform and type (Spotify, YouTube, social, store, generic) using host and path patterns including SPOTIFY_URI_RE. The result drives metadata extraction. Large function (~330 lines).
- `decodeHtmlEntities` [unclear/medium]: Likely decodes HTML entities in scraped titles and descriptions.
- `tryOEmbed` [unclear/low]: Likely attempts to fetch oEmbed metadata for a URL as a cheaper alternative to scraping HTML, and returns null when it is unavailable.
- `inferSiteNameFromUrl` [unclear/medium]: Likely derives a human-readable site name from a URL's hostname.
- `scrapeHtml` [unclear/low]: Likely parses fetched HTML for metadata (title, OpenGraph, description, images), using decodeHtmlEntities. Large function (~170 lines).
- `isReplitDevHost` [unclear/low]: Likely detects Replit dev/preview hostnames so such URLs get special handling, e.g. resolving internal route metadata instead of fetching them.
- `getMaxBoosterRouteMeta` [unclear/low]: Likely returns static metadata for known Max Booster routes, so self-hosted URLs get titles and descriptions without a network fetch.
- `fetchUrlMetadata` [unclear/medium]: Likely top-level URL metadata resolver. It classifies the URL, tries oEmbed, then HTML scraping, with SSRF protection and size limits, and returns a normalized metadata object.
- `getHashtagsForPlatform` [unclear/low]: Likely returns a platform-appropriate hashtag set, possibly based on genre, topic or platform.
- `buildCopyFromContext` [unclear/low]: Likely builds post copy text from a gathered context object. Very short (about 5 lines), probably a thin wrapper.
- `_localAnalyzeUrl` [unclear/low]: Likely a local (non-MaxCore) URL analysis fallback. The underscore prefix suggests it is internal or legacy and may be unused after the MaxCore-only migration.
- `normalizeMultimodalUrl` [unclear/low]: Likely normalizes URL strings (trim, scheme, strip tracking) before analysis.
- `normalizeMaxcoreAnalyzeResponse` [unclear/medium]: Likely maps a raw MaxCore analyze response into the module's internal analysis/metadata shape.
- `normalizeInput` [unclear/low]: Likely validates and normalizes a GenerationRequest into a canonical form (platforms, modalities, URLs, defaults) before planning. About 100 lines.
- `buildStepParamsForPlatform` [unclear/low]: Likely builds the per-platform parameter object for a TaskStep (rules, slots, durations) from PLATFORM_RULES.
- `planTasks` [unclear/low]: Likely entry point that turns a normalized request into a TaskPlan, probably delegating to buildDefaultPlan. Short (about 9 lines).
- `buildDefaultPlan` [unclear/low]: Likely constructs the default TaskPlan, with steps for text, image, audio and video per requested platform and pack. About 190 lines.
- `enrichTextAssetMetadata` [complete/medium]: Enrich a generated text payload with metadata. It extracts hashtags, emoji, word and char counts, and the char limit. It infers hook/body/CTA by paragraph, sentence or CTA-keyword heuristics when not supplied. It then computes a platform-calibrated engagement score with suggestions (TikTok, Instagram, ... switch). The inventory's 'stub=empty' flag is wrong, since the body is substantial. The excerpt cuts off in the switch, so the returned metadata shape and the other platforms are not visible.
- `handleGeneration` [unclear/low]: Likely the top-level request handler (probably an Express handler or service entry) that runs normalization, planning, execution and packaging, returning the MultimodalPackage or an error response (e.g. AI-unavailable).
- `slugTopic` [unclear/low]: Likely produces a URL- or filename-safe slug from a topic or title. Around 40 lines, so it may have fallbacks.
- `rawUrlFallback` [unclear/low]: Likely supplies minimal metadata derived only from the raw URL when scraping or analysis fails.
- `mapOutputs` [unclear/low]: Likely maps worker results or generated assets into the package's output structure, grouped by modality or platform.
- `outputs` [unclear/low]: Likely a small helper or closure (about 13 lines) that collects or returns the outputs of a step or plan.

### `server/services/pushNotificationTypes.ts`

Defines the rich web-push notification payload shape and context type, and provides pure builders that map notification type strings (social, security, distribution, royalties, marketplace, etc.) to user-facing payloads (title, body, url, actions, vibration, tag, category), plus a silent background-push builder.

- `buildPushPayload` [complete/high]: Translate a notification type string and optional context into a fully populated RichPushPayload with type-specific title, body, URL, tag, category, action buttons, vibration pattern, and interaction flags. Unknown types fall back to a generic 'Max Booster' notification.
- `isSilentPushType` [complete/medium]: Check whether a notification type string denotes a silent/background push by the 'silent_' prefix, matching the tag convention in buildSilentPayload.
- `buildSilentPayload` [complete/high]: Build a silent, non-visible push payload that tells the client to do a background refresh (feed, message sync, or unread count update) without showing a notification.

### `server/services/safeUrlFetch.ts`

Shared SSRF-safe outbound HTTP fetch utility. It validates that a URL is a public http(s) URL, and it enforces a connect-time DNS guard through custom http/https Agents that rejects private or reserved resolved addresses. This closes the DNS-rebinding window. Fetches are bounded by redirect count, response size and timeout. The header comment says all attacker-influenced URL fetches (URL→content generation, URL parser, autopilot link enrichment) must go through this module.

- `isReservedIp` [complete/high]: Decide whether an IP literal (or the literal 'localhost') is private, loopback, link-local, CGNAT, documentation, multicast, transition or otherwise non-public. It is the core predicate for every SSRF check in the module. It is conservative: unparseable or non-global-unicast IPv6 and condensed hex IPv4-mapped IPv6 are treated as reserved.
- `assertPublicHttpUrl` [complete/high]: Pre-flight validation that a raw string is a fetchable public http(s) URL. It rejects invalid URLs, non-http(s) schemes, embedded credentials, localhost/.local/.internal hostnames, and literal private or reserved IPv4/IPv6 hosts. It returns the parsed URL. The docstring says the connect-time DNS guard stays authoritative for hostnames that resolve to private IPs.
- `safeFetchText` [complete/high]: Fetch a public URL and return its body decoded as a UTF-8 string, with the SSRF, redirect, size and time protections of safeFetchBuffer. It returns non-2xx responses to the caller and throws only on network errors, SSRF blocks, or invalid URLs.
- `safeFetchBuffer` [complete/high]: Core SSRF-hardened GET returning the raw body bytes. It validates the URL, optionally restricts the host through an allowedHost predicate, and uses custom http/https agents with connect-time DNS filtering. It also applies a timeout, a size cap, at most 3 redirects (each hop re-validated, and credentials in a redirect rejected), no proxy, and a browser-like UA. It accepts all status codes.

### `server/services/socialSyncService.ts`

Pulls fresh profile and audience stats (username, follower count, profile URL, platform user ID, extra metadata, engagement rate) from connected social platforms for one user. Along the way it refreshes expired OAuth tokens, decrypting and re-encrypting stored credentials, and writes the results back to the socialAccounts table. The only export is syncPlatformData.

- `refreshOAuth2Token` [complete/high]: Generic helper that exchanges a refresh_token for a new access token at a standard OAuth2 token endpoint, using a form-encoded POST with client credentials in the body. It normalizes the response into a TokenRefreshResult.
- `getValidAccessToken` [partial/medium]: Returns a usable plaintext access token for a social account connection. It decrypts the stored credentials, checks expiry with a 60s skew, and if expired refreshes via the platform-specific mechanism (Google, Twitter Basic auth, TikTok, LinkedIn, Threads GET, Facebook/Instagram long-lived exchange). It then persists the new encrypted tokens and expiry. On refresh failure it flags metadata.needsReconnect and falls back to the expired token.
- `calcEngagementRate` [complete/high]: Estimates a platform engagement rate for a user as the average of (likes+comments+shares) per post over the last 30 published posts, divided by follower count and expressed as a percentage rounded to 2 decimals and capped at 100.
- `syncPlatformData` [complete/high]: Exported entry point that syncs live profile and audience stats for a user's connected platform. 'meta' expands to facebook and instagram. For each platform it loads the connection, obtains a valid token, calls the platform-specific API, computes engagement rate, persists the results to socialAccounts, and returns per-platform results.

### `server/services/voiceSynthesisService.ts`

Voice-synthesis service for Max Booster. It generates speech through MaxCore (the only TTS source; it throws AIUnavailableError when MaxCore is unavailable and has no local fallback). It also offers a catalog of 'voice profiles', a heuristic analyzer for reference audio, and multi-segment stitching with FFmpeg. The header says FFmpeg is for post-processing only, but in this file FFmpeg is used only for reference analysis, silence generation and concatenation.

- `resolveFFmpegPath` [complete/high]: Locate an FFmpeg binary once at module load. It tries FFMPEG_PATH, then `which ffmpeg`, then known Nix/Linux install paths, and finally falls back to the bare name 'ffmpeg' on PATH.
- `VOICE_PROFILES` [partial/medium]: Static catalog of 14 named voice presets (radio_announcer, hype_man, deep_boss and others), keyed by id. Each carries a category, gender, description and legacy FFmpeg DSP parameters.
- `analyzeReferenceVoice` [complete/medium]: Estimate coarse characteristics of a reference voice sample (energy, pitch bucket, tempo bucket) and suggest the closest VOICE_PROFILES id. It runs FFmpeg astats and applies heuristics to the RMS and peak levels.
- `synthesizeVoice` [partial/high]: Generate speech audio for text via MaxCore /api/generate/audio and save it under uploads/voices. It throws AIUnavailableError when MaxCore is down or returns no audio. It returns a SynthesisResult with the output path.
- `synthesizeSegments` [partial/high]: Synthesize several text segments (optionally with silent pauses between them) and concatenate them into one WAV file using FFmpeg's concat demuxer.
- `listVoiceProfiles` [complete/high]: Return all available voice profiles, probably for UI or API listing.
- `getVoiceProfile` [complete/high]: Look up a single voice profile by id.
