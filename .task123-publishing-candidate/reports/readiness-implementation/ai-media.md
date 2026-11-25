# AI / MaxCore / media implementation

## Scope and disposition

Implemented the recommended direction only: authoritative MaxCore contracts and deterministic media conditioning, required-component delivery validation, compatible checkpoint loading, and bounded classified retries. No application startup, provider calls, database access, migrations, training, dependency installation, publication, or secret inspection occurred. The stopped app was not screenshotted or started. Max remains exempt; no local app-side AI substitute was added.

This is **not a release-ready certification**. Data-dependent prediction and checkpoint qualification remain genuinely blocked. Successful syntax/unit checks do not establish a qualified live model or rendered-media quality.

| Audit ID | Status | Actual implementation/evidence | Remaining gate |
|---|---|---|---|
| AM-1 | **Fabricated-code cleanup addressed; calibrated scoring blocked** | `generateABVariants` retains its existing authoritative `generateSocialDirect` result and null performance value. Removed the entire unreachable local-tone/random-score/fixed-confidence implementation (155 lines), so removing an earlier return cannot reactivate it. Both socialAI consumers preserve null. Focused source regression test verifies authoritative generation remains and no alternate fabricated block survives. | Consented impression/outcome data, target units/horizon, versioned calibrated MaxCore variant-and-score endpoint, held-out calibration and provenance. No calibrated scorer or fake prediction was implemented. |
| AM-2 | **Blocked** | Existing explicit unavailable prediction paths retained, rather than replacing them with local heuristics, random outcomes, or invented confidence. | Each supervised capability requires authorized observations, target definitions, training and task-specific evaluation. See capability inventory below. No predictive capability is marked implemented. |
| AM-3 | **Addressed in code; release verification pending** | Both canonical video workers use required-audio helpers that now raise on synthesis/dataset failure. The primary worker no longer swallows soundtrack-future failure. Real voice-only padding and narration/music mixing are retained; overlong speech or failed required mixing cannot become successful music-only output. `render_cinematic_open` validates required audio, actually muxes audio for one-scene output, checks encoded output audio duration, rejects partial scene success, and no longer substitutes one scene for failed composition. Multi-scene FFmpeg now explicitly maps the audio input and pads it. Transition overlap is budgeted into scene durations to avoid losing the end of narration. | Run real eSpeak/dataset/FFmpeg tests in the authorized MaxCore runtime, inspect intelligibility and narration completion, test missing binary/data and intentionally silent requests, and verify final duration/container streams. Unit mocks are not rendered-media acceptance. |
| AM-4 | **Implemented conditioning contract; end-to-end acceptance pending** | App image service preserves all ten ordered images, rejects missing assets rather than filtering them away, reads voice/logo assets, and sends `media_manifest.version=1` through the active advanced renderer. Python request/worker consume it. Scene builder creates enough scenes and sets real `reference_b64`; blank-copy image scenes are not discarded. MaxCore performs deterministic PIL image resize/crop and alpha-logo composition rather than silently replacing supplied images with a generated background. Manifest controls set actual scene grade, measured-audio-onset cut times, explicit transition, and real voice/music mixing. Xfade failure cannot silently become a hard cut. Resolved receipt flows through Python job polling, the app polling adapter, `VideoGenResult`, and the existing music-video job result. | Runtime ten-image render plus each advanced control independently, final frames/cuts/voice/logo/grade versus receipt, payload limits and audiovisual UX review. Beat sync is **measured onset alignment**, not a claimed learned beat/BPM prediction; audio with insufficient onsets fails explicitly. Supported grades/transitions are validated, not silently defaulted. |
| AM-5 | **Partial; qualification blocked** | Both native HyperCreativeTransformer loading branches now require complete name/shape-compatible checkpoints with strict loading; absent weights or failed backends cannot become a randomly initialized inference model. Initialization wait is bounded and reports unavailable instead of waiting forever. Tests exercise complete/prefixed state, missing weights, unexpected tensors, and wrong shapes. | This does **not** prove training or qualification. Signed architecture/tokenizer identity, dataset provenance, checkpoint digest, held-out task evaluations and trusted promotion/signature verification remain absent. Actual trained checkpoint/evaluation artifacts and signing trust configuration are unavailable; none were fabricated. `_model_ready` remains initialization compatibility, not qualified readiness. Split initialized/trained/qualified health and gate all native-task inference after the signed qualification contract is supplied. |
| AM-6 | **Addressed in code; real-runtime acceptance pending** | Canonical audio renderer and optional measured analysis now execute in a fresh POSIX subprocess group, never by Python-forking the threaded model server. At most three classified attempts share a 120-second absolute deadline including admission. Cancellation/deadline terminate the process group (TERM, bounded grace, KILL), reap the leader and remove private staging. JSON result/version/size and owned artifact paths are checked before promotion. The two video soundtrack callers also use isolation with a 20-second budget within their existing 25-second future wait. An authenticated audio DELETE endpoint is consumed by the existing Node `/jobs/:jobId/cancel` route. Job updates use a cross-process file lock and cannot overwrite terminal states. Heartbeats stop before terminal writes. | Real-render latency/quality at the deadline, sustained concurrency, aggregate RSS, process-tree behavior under OS pressure and abrupt supervisor death remain release gates. Tests use tiny fake native functions, not heavy rendering. POSIX process groups cannot reclaim an uninterruptible kernel task or a deliberately detached descendant; cgroup-level lifecycle enforcement remains an operational requirement. |

## Contract and consumer details

New focused MaxCore modules:

- `ai_model/media_contract.py`: checkpoint tensor validation, finite classified retry helper, and FFprobe audio delivery validation.
- `ai_model/isolated_audio.py` / `isolated_audio_worker.py`: one admitted renderer per Python process, fresh exec, private staging, bounded trusted-function export and result protocol. The parent exports the four canonical function objects' source into a mode-0600 invocation file; request data cannot supply code. Only those function definitions are compiled in the child, avoiding import of the canonical server and its model/provider startup side effects. Native imports happen under child thread caps. Optional measured analysis runs inside the same killable boundary. Child-local L1 caches are not promoted into the parent's warm cache; performance acceptance must measure this trade-off.
- `ai_model/video/media_manifest.py`: version 1 validation and deterministic conditioning. Fields: `version`, optional `voice_b64`/`logo_b64`, boolean `beat_sync`, `color_grade`, `transition`. Image order remains `reference_images` (maximum ten). Binary values are bounded and decoded strictly.
- Receipt: `version`, `scene_count`, `image_count`, `cut_times`, `beat_sync`, `color_grade`, `transition`, `transition_duration`, `voice_asset`, `logo_asset`. It records the resolved controls and measured cut schedule, **not** model quality/confidence.

Active chain: `socialMedia.ts` music-video upload → `imageToMusicVideo` → `advancedVideoRendererService.renderVideo` → existing MaxCore Node `/generate-video` proxy → Python `/api/generate-video` → `_start_video_job` → `apply_manifest` / scene renderer / cinematic compositor → `/api/video-job/{id}` → app poller → existing music-video job result. No separate unused “replacement service” was introduced.

The older Python `/api/video/generate-ai` worker shares required-audio/output checks and accepts up to ten references, but the new manifest is intentionally wired to the app's active `/api/generate-video` endpoint. No assumption is made that an external caller of the older endpoint supports the new manifest.

## AM-2 capability-specific blockers

All remain **blocked**, not “implemented by returning 503”:

- Engagement scores and best posting time: consented content impressions/interactions with exposure denominators, timestamps, platform and creator coverage; calibrated engagement and timing targets.
- Metric prediction and revenue forecast: authorized historical time series with consistent units, attribution, refunds/censoring, forecast horizon and rolling-origin holdouts.
- Churn: defined eligible population, label window and actual retention outcomes.
- Anomalies: observable metric history and validated false-positive/incident targets.
- Business insights: evidence-backed measured inputs plus a qualified MaxCore insight contract; generated prose alone is insufficient.
- Career growth and milestones: authorized longitudinal artist outcomes and explicit milestone labels/horizons.
- Fanbase insights: consented audience/cohort history and validated insight targets.
- Release strategy, A&R trend forecast and release timing: performance/audience sources, release history and time/creator-separated evaluation. The audited A&R 501 paths remain unavailable.

No new tables were invented as a substitute for this missing evidence.

## Executed checks

1. `env -i PATH=/usr/bin:/bin /home/runner/workspace/.pythonlibs/bin/python3 -B external/maxcore/artifacts/ai-training-server/tests/test_media_delivery_contract.py`
   - **15 tests passed**, final run 0.335 s.
   - Includes actual ten-image scene-reference ordering, ten distinct real PIL image pixel outputs, real alpha-logo compositing, measured synthetic PCM onset selection, silence rejection, scene-control/overlap schedule, FFmpeg audio-map command construction, required-stream validation, narration/soundtrack error propagation, checkpoint validation, finite retries/deadline/cancellation.
   - External subprocess/model boundaries are mocked. Synthetic test fixtures are confined to tests and are not production artifacts or model evidence.
   - Sanitized PATH has no FFmpeg; importing the lightweight utility prints its existing binary-resolution warning. No FFmpeg/model/server process was launched by these tests.
2. `env -i` Python AST parse of eight changed production Python files: **passed**.
3. Local esbuild syntax transform of the three changed TypeScript media services, no bundling/execution: **passed**.
4. Focused `git diff --check` for owned modified production paths: **passed**.
5. `env -i` Node VM execution of the actual TypeScript receipt validator (esbuild syntax transform only): **9 assertions passed** — matching receipt accepted; missing receipt and mismatched version/image count/beat sync/grade/transition/voice/logo rejected. No adapter imports or network boundary execution.
6. Follow-up `env -i` Python `tests/test_isolated_audio.py`: **6 tests passed**, including real tiny subprocess success/promotion, transient failure/malformed/missing result cleanup, native-hang kill and slot reuse, cancellation, SIGKILL of a TERM-ignoring child/descendant, and actual production terminal-state mutation protection. No render/model/provider was executed.
7. Follow-up `env -i` Node `--test tests/unit/aiMediaResourceContracts.test.mjs`: **5 tests passed** — supervisor resource budgets, nested libuv/native thread caps, invalid allocation rejection, actual nested worker heap setup, and removal of historical fabricated A/B code.
8. Final combined rerun: **15 media + 6 isolation + 5 resource/dead-code tests passed**; ten production Python files AST-parse; seven owned TypeScript entrypoints/services esbuild-transform; focused whitespace check passed. The real subprocess fixtures only sleep/write tiny test files and have no model, provider or renderer imports.

No full typecheck, full suite, browser/runtime, live model, database or provider acceptance was run.

## Integration, migrations, and release gates

- **Migration IDs: none. No schema/database changes.**
- **Required shared-file patches for this implementation: none.** No edits were made to `shared/schema.ts`, `server/routes.ts`, `server/index.ts`, `server/storage.ts`, package/deployment files, or `client/src/App.tsx`.
- Ship the Python request/worker/renderer and app adapter changes together. The app rejects missing/mismatched version, image count and control receipts on both synchronous/asynchronous completion, so an older MaxCore cannot silently ignore this manifest and be reported as successful. Until the deployed upstream identity/version and receipt are verified, do not declare the advanced-control contract available.
- No sibling/domain changes are assumed. The main agent still owns app startup and end-to-end integration acceptance.
- Remaining model/data blockers require real authorized artifacts and acceptance decisions, not generated placeholder manifests, locally fabricated predictions, or expensive unauthorized training.

## Authorized deployment resource follow-up

Resource-only integration now consumes deployment's `ComputeSizingResult.workerHeapMB`, `maxcorePrimaryHeapMB` and `pythonThreads` in `maxcoreLocalSupervisor.ts`. The coordinator heap allocation is split between TSX launcher and nested primary; HTTP workers receive the independently allocated `workerHeapMB` through `MAXCORE_NODE_WORKER_HEAP_MB`, consumed by resource-only `cluster.setupPrimary({execArgv})` in the MaxCore Node entrypoint. Existing inherited heap overrides are replaced, not compounded. Worker lifecycle, supervision and startup sequencing are unchanged.

Child environment caps `UV_THREADPOOL_SIZE`, BLAS/OpenMP/NumExpr/BLIS/vecLib pools to one; `UVICORN_WORKERS=1` and `MAXCORE_NUM_STREAMS=1` prevent nested worker multiplication outside Python's allocation. HyperGPU modeling uses `pythonThreads`, not Node's pool. The existing Python-spawn adapter preserves this environment, and hardware bootstrap respects existing thread variables. These are heap/concurrency limits, **not measured Python/native RSS ceilings**. At deployment's current 153-MiB coordinator heap allocation, launcher and primary each receive 76 MiB; real cold-load/peak acceptance is mandatory before approving that small profile. No reservation was silently inflated or subsystem disabled.

Deployment report DEP-05 carries the same explicit interface. AM-2 and AM-5 remain real data/training/signature-evidence blockers; this follow-up supplies none of those missing artifacts.