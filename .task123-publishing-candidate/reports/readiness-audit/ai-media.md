# AI, MaxCore, media and analytics readiness audit

Date: 2026-09-19. Method: read-only examination of current source; no runtime, provider, database, credential-value, or heavyweight test inspection. MaxCore is the sole AI authority; the Max assistant is exempt. Deployment packaging and general persistence are outside this domain. This is a source audit, not certification of the running remote model.

## Blocker list

### AM-1 — Fabricated A/B performance and locally authored AI variants

**CONFIRMED defect · P1 · High confidence.** Release scope: social AI A/B generation and any ranking/selection based on its scores.

`server/services/aiContentService.ts:1098-1109` substitutes the input text when MaxCore's response lacks usable output. Lines `1111-1132` locally transform its tone; `1135-1140` assign each variant a random 75–95 predicted performance score. Lines `1152-1156` attach fixed explanation confidence of 0.9. These are not measured outcomes or MaxCore prediction outputs. Both HTTP consumers map these numbers to `predictedEngagement`: `server/routes/socialAI.ts:700-710` and `725-750` (POST `/ai-content/ab-variants`, plus the preceding GET handler). Route registration exists at `server/routes.ts:7257-7258`.

Impact: arbitrary numbers can influence content decisions; local rewriting violates sole-authority requirements when presented as generated AI variants. This is a remaining live fabrication, unlike historical engagement heuristics now behind an unconditional error.

### AM-2 — Predictive analytics and engagement capabilities have no working authoritative contract

**CAPABILITY GAP · P1 · High confidence.** Release scope: engagement/best-time predictions, AI analytics/forecasting, A&R forecast and release-timing promises. Ordinary observed analytics are not implicated.

The canonical Python engagement entrypoint unconditionally returns 503 at `external/maxcore/artifacts/ai-training-server/server.py:8569-8579`; historical heuristics below it are unreachable, not current fabrication. The Node proxy forwards that endpoint at `external/maxcore/artifacts/api-server/src/routes/model-proxy.ts:1513-1514`. The autopilot adapter independently throws at `server/services/aiModelManager.ts:137-142`; its consumer is `server/routes/autopilot.ts:392`. Unified prediction is consumed at `server/routes/ai.ts:342`.

Related missing authoritative contracts are explicitly enforced by `server/services/aiAnalyticsService.ts:7-10`: metric prediction (`101`), churn (`234`), revenue forecast (`325`), anomalies (`397`), business insights (`467`), career growth (`664`), milestones (`799`), fanbase insights (`874`), and release strategy (`1059`). Public consumers include `server/routes/ai.ts:393-432,776-785,796-858`; metric forecasting also throws at `server/services/unifiedAIController.ts:937-942`. The direct analytics-insights handler throws without calling an upstream model. A&R `/trend-forecast` and `/release-timing` return 501 at `server/routes/arIntelligence.ts:69-77,189-197` because performance/audience sources are absent.

Impact: advertised predictions cannot complete; confidence-gated decisions cannot obtain genuine scores. Honest unavailable responses are the correct current behavior, not a defect to “fix” by restoring random/local fallback. All named instances need capability-specific acceptance, even if implemented on a shared MaxCore platform.

### AM-3 — Requested video narration/audio may silently disappear

**CONFIRMED defect · P1 · High confidence.** Release scope: MaxCore videos requested with voiceover or generated audio.

`external/maxcore/artifacts/ai-training-server/server.py:9618-9648` returns `None` on failed speech synthesis and logs rather than surfacing failure. The auto-soundtrack helper similarly permits silent output (`9665-9674`, exception handling at `9691`). The primary video consumer only changes audio and marks voiceover when a path exists (`10441-10464`). The render-only path does likewise for generated audio and requested narration (`10952-10983`) and continues rendering. Video extension also calls the soundtrack helper (`10716`).

Impact: a playable file is not fulfillment of a narration/audio request. The shown callers do not enforce requested versus delivered audio before rendering; the render-only path marks a successful render `done` at `10989-10998` without verifying audio fulfillment. A missing dependency/dataset can therefore produce a semantically incomplete successful artifact. This is not an assertion that every silent video is wrong: intentionally silent requests remain valid.

### AM-4 — Image-to-video accepts assets/options that the active MaxCore handoff drops

**CONFIRMED defect · P2 · High confidence for payload loss; downstream visual impact requires integration verification.** Release scope: multi-image music-video generation and its advanced controls.

The authenticated `/generate-music-video` upload accepts ten images (`server/routes/socialMedia.ts:5375-5383`). The active `imageToVideoService` forwards only the first three (`server/services/imageToVideoService.ts:608-615`); its “last frame” is the last of those three, not the last uploaded image (`629-631`). Its options promise `voiceSynthPath`, `logoPath`, `beatSync`, `colorGrade`, and `transitionType` (`183-188`), but the full active MaxCore call (`616-639`) forwards none of them. The route supplies advanced options, including beat sync and color grade (`server/routes/socialMedia.ts:5529-5538`).

Impact: accepted inputs are not faithfully represented in the generation request. Local legacy helpers are not proof these options work: the active entrypoint returns the MaxCore result directly. Motion intensity is **not** a finding: it is correctly mapped at `633-638`, despite an obsolete helper comment claiming otherwise.

### AM-5 — Native model loading does not establish trained, compatible, qualified readiness

**VERIFICATION GATE · P1 · High confidence in missing initialization gate; unverified live checkpoint condition.** Release scope: all native-model inference and training-readiness claims.

The canonical initializer filters checkpoint tensors by matching name and shape, then loads with `strict=False` (`external/maxcore/artifacts/ai-training-server/server.py:852-868`); the fallback repeats this and explicitly supports random initialization (`889-901`). Initialization records whether a weights path exists, then sets `_model_ready = True` (`949-956`). The readiness wait returns immediately for that flag (`416-426`). This establishes construction, not checkpoint completeness, training lineage, or task quality. It does **not** prove production currently serves random weights.

Impact: startup success alone is insufficient release evidence. Require checkpoint identity, compatibility coverage, provenance and held-out task results before approving inference. Training loss is not automatically fabricated: current training updates calculate loss/perplexity from trainer/evaluation results (`server.py:2781-2799`); no allegation of fake loss is made.

### AM-6 — Audio render errors can leave jobs retrying forever

**CONFIRMED defect · P1 · High confidence.** Release scope: MaxCore audio generation job completion, caller polling, and resource availability.

The canonical audio job deliberately loops until render succeeds (`external/maxcore/artifacts/ai-training-server/server.py:10070-10085`). Exception handling counts repeated errors but remains in the loop, records status `rendering`, and sleeps with a bounded delay rather than a bounded retry budget (`10086-10111`). At five repeated errors it requests watchdog attention, but that hook is optional/best-effort and the loop continues (`10092-10104`); escalation is not a completion bound. Terminal `done` is only reached after escape (`10112-10118`). No cancellation/deadline check exists inside this loop.

Consumer example: studio audio style transfer calls `/api/generate/audio` via MaxCore (`server/services/aiAudioGeneratorService.ts:230-262`). Impact: a permanent renderer/input error can consume a worker indefinitely and strand a user job, even if the outer HTTP client times out. This finding concerns execution semantics, not job persistence or deployment.

## Repair playbooks

Each alternative below is a different complete implementation strategy, not a step of another alternative. Choose one per finding after requirements review; none guarantees first-attempt success. No alternative treats hiding the feature, replacing results with mocks, or bypassing MaxCore as remediation.

### AM-1 alternatives

**A — MaxCore variant-and-score endpoint (recommended).** Lowest ambiguity; requires a calibrated scorer.
1. Define a versioned response containing model-generated variants, metric units, uncertainty, and model provenance.
2. Implement joint variant generation and calibrated scoring inside MaxCore using consented outcome data.
3. Replace local tone transforms, random numbers, and fixed explanation confidence; migrate consumers to the typed contract.
4. Test unavailable/malformed upstream responses and held-out score calibration, including repeated identical requests.
5. Accept only when each displayed prediction traces to its MaxCore result and no local substitution survives.

**B — Measured online A/B experiments.** Strong causal evidence; slower and requires sufficient audience traffic.
1. Define consent, traffic allocation, attribution windows, and minimum sample sizes.
2. Have MaxCore generate variants and assign experiment arms; collect actual impressions and outcomes.
3. Replace predicted fields with explicitly measured experiment metrics and MaxCore statistical conclusions; migrate existing records as unverified.
4. Test allocation bias, deduplication, delayed outcomes, low-sample behavior, and confidence-interval coverage.
5. Accept when real experiment outcomes support displayed rankings and the complete generation-to-result workflow works.

**C — MaxCore pairwise preference model.** Easier than absolute engagement calibration; ranking is not an engagement-rate prediction.
1. Specify pairwise quality/ranking semantics and gather labeled comparisons with measured outcome links.
2. Train and serve a MaxCore preference scorer alongside MaxCore variant generation.
3. Replace the API/UI's percentage prediction with ranked comparisons, uncertainty and provenance; migrate clients together.
4. Evaluate held-out ranking agreement and failure behavior; verify no absolute engagement claim remains.
5. Accept when users can generate and compare variants using validated authoritative ranks.

**D — Authoritative asynchronous batch scoring.** Supports expensive scoring and reuse; adds pending-job UX.
1. Define content fingerprints, model versions, result expiry, and per-user isolation.
2. Implement a MaxCore batch generation/scoring job with calibrated output and explicit terminal errors.
3. Migrate both variant routes and explanation records to pending/completed job results.
4. Test stale scores, changed text, concurrent requests, upstream failures and calibration.
5. Accept only when completed variants have matching content/model provenance and never borrow another variant's score.

### AM-2 alternatives

**A — Dedicated supervised MaxCore services (recommended).** Best contract clarity; largest labeled-data requirement.
1. Inventory every named capability, consumer, target variable, data authorization and minimum history.
2. Connect measured engagement, audience and revenue inputs; build task-specific MaxCore training/evaluation pipelines.
3. Implement versioned inference endpoints and migrate every throwing adapter/501 consumer to validated contracts.
4. Backtest by time and creator, assess calibration/bias, and test insufficient-data and outage responses.
5. Accept each capability separately only when its end-to-end real-data workflow and quality threshold pass.

**B — MaxCore probabilistic time-series service.** Shared quantitative foundation; less suited to sparse creator histories.
1. Specify consistent series, horizons, seasonality, censoring and uncertainty requirements for each capability.
2. Implement hierarchical probabilistic forecasting, anomaly detection and timing optimization inside MaxCore.
3. Add MaxCore evidence-grounded insight/recommendation adapters over those estimates; wire all named consumers.
4. Test rolling-origin forecasts, cohort transfer, missing data and interval coverage against agreed baselines.
5. Accept only after quantitative and recommendation-specific criteria pass, not merely a successful HTTP response.

**C — Retrieval-conditioned MaxCore reasoning with quantitative tools.** More explainable insights; tool correctness becomes critical.
1. Define an authorized evidence store and quantitative tool schemas for all prediction tasks.
2. Implement trained MaxCore reasoning that invokes real forecasting/survival/engagement tools and cites retrieved observations.
3. Deliver structured forecasts and recommendations through existing routes, enforcing typed numeric evidence and source timestamps.
4. Test hallucinations, cross-user retrieval, tool failures, numeric consistency and predictive calibration.
5. Accept when every supported claim has valid evidence and every prediction meets a held-out performance threshold.

**D — Scheduled MaxCore decision bundles.** Efficient for dashboards; freshness and interactive latency differ.
1. Define per-creator daily/weekly bundles covering every named forecast, insight and optimization, with expiry and minimum history.
2. Build authoritative MaxCore batch analysis on measured inputs, with trained task models and capability-specific quality gates.
3. Change consumers to retrieve fresh bundles or request recomputation; migrate UI to explicit analysis-as-of times.
4. Test missing bundles, stale inputs, task-specific failures and rolling backtests for every output type.
5. Accept when complete real-data bundles reach all consumers within freshness SLOs; a partial bundle cannot imply universal support.

### AM-3 alternatives

**A — Strict audio fulfillment before finalization (recommended).** Most predictable user contract; optional audio failures become explicit failed jobs.
1. Define required audio/narration flags and concrete delivery checks for each video entrypoint.
2. Make synthesis helpers return typed failures; require successful speech/soundtrack before final render completion.
3. Propagate actionable job errors and preserve retryable intermediate video assets.
4. Test missing engines, missing dataset, empty speech, invalid audio and valid intentionally silent requests.
5. Accept when a required-audio request cannot complete without a verified matching audio track and intelligible narration.

**B — Audio-first two-stage media pipeline.** Avoids wasted rendering; increases orchestration complexity.
1. Define audio and video subjob contracts, dependencies and cancellation behavior.
2. Produce and validate requested soundtrack/narration first inside MaxCore, then render against its timed audio manifest.
3. Migrate all three consumers to the dependency pipeline and surface subjob progress/errors.
4. Test duration mismatch, retries, voice selection, mux failures and cancel propagation.
5. Accept only when both validated subjobs produce one final artifact satisfying requested audio features.

**C — Multiple qualified speech/audio backends inside MaxCore.** Higher resilience; greater maintenance and licensing burden.
1. Qualify permitted in-house backends for requested languages/voices and soundtrack characteristics.
2. Implement MaxCore-controlled equivalent-capability routing with bounded failover and explicit no-capability errors.
3. Record delivered engine, voice and audio provenance; migrate callers to require the selected capability.
4. Inject primary-engine failures and assess secondary output intelligibility, timing and rights.
5. Accept when failover delivers the requested semantics or reports failure, never an unannounced silent replacement.

**D — Repairable partial-production workflow.** Preserves useful video work; requires clear user approval states.
1. Define incomplete versus completed artifact states and an audio-repair action.
2. Have MaxCore return a missing-component manifest when audio fails, retaining the visual intermediate.
3. Implement audio regeneration and remuxing, with user approval before final completion; migrate download/publishing consumers.
4. Test partial generation, repeated repair, changed narration and attempts to publish incomplete output.
5. Accept when required components are verified before final delivery and users can genuinely finish the repair workflow.

### AM-4 alternatives

**A — Full MaxCore media manifest (recommended).** Preserves existing product promises; requires expanded upstream contract.
1. Inventory every accepted option and define semantics, asset ownership and ordering.
2. Extend MaxCore's request schema/planner to consume all images, voice assets, logo, beat sync, color and transitions.
3. Replace truncation/omission with an ordered manifest and return a resolved-options receipt.
4. Test ten distinct images and each control independently; compare output frames/audio with the receipt.
5. Accept only when every accepted input influences the intended output or receives a specific preflight validation error.

**B — MaxCore storyboard subjobs and assembly.** Works with limited reference windows; more render coordination.
1. Define scene mapping for all submitted images and global visual/audio controls.
2. Let MaxCore plan multiple reference-limited scene jobs while retaining original image order.
3. Assemble inside MaxCore with global logo, voice, beat synchronization, grades and transitions.
4. Test image-boundary continuity, scene duration totals, all controls and subjob failures.
5. Accept when all requested assets appear as planned and the final assembly fulfills global controls.

**C — MaxCore-owned asset preprocessing and compositing.** Decouples generation from presentation; adds intermediate asset handling.
1. Classify controls as planning, conditioning or final-composition requirements.
2. Build MaxCore preprocessing for all image references and conditioning audio, plus explicit postcomposition for logo/grade/transitions.
3. Migrate the app to send one authoritative composition specification rather than ignored optional fields.
4. Test individual preprocessing/compositing stages and end-to-end multi-image output fidelity.
5. Accept only after every advertised control has an observable validated effect without local AI reinterpretation.

**D — Interactive authoritative storyboard editor.** Gives users explicit control; largest UX change.
1. Define editable scene/asset mappings and expose MaxCore's actual per-scene reference constraints.
2. Implement a MaxCore planning API that proposes a complete storyboard using all assets and advanced controls.
3. Let users confirm/edit the storyboard, then execute it through MaxCore and migrate the one-shot entrypoint.
4. Test reordered assets, more than three images, custom audio/logo and all accepted render settings.
5. Accept when confirmed storyboards and delivered assets agree; UI acknowledgment alone is not fulfillment.

### AM-5 alternatives

**A — Signed qualified checkpoint manifest (recommended).** Reproducible promotion; requires model-release discipline.
1. Define mandatory architecture/tokenizer identity, tensor coverage, dataset provenance and task-evaluation thresholds.
2. Produce signed manifests from actual training/evaluation; reject incompatible or incomplete inference checkpoints.
3. Split initialized, trained and qualified readiness; migrate wait/health consumers to qualified state.
4. Test missing weights, wrong shapes, partial tensors, invalid signatures and valid qualified checkpoints.
5. Accept with a reproducible manifest-to-running-model identity and held-out results for every advertised native task.

**B — Shadow qualification before model promotion.** Captures integration regressions; consumes extra compute.
1. Define sanitized representative task suites and incumbent quality/safety baselines.
2. Load candidates into an isolated training/shadow state and run real inference evaluation.
3. Promote only passing candidates through MaxCore's model registry; retain the last qualified model.
4. Test random-init and partially loaded candidates, rollback, and scoring reproducibility.
5. Accept when unqualified candidates never receive production inference and promotion evidence is inspectable.

**C — Mandatory startup qualification suite.** Simple deployment-independent gate; slower cold starts.
1. Establish minimum tensor integrity and task-quality checks with known evaluation provenance.
2. Run integrity checks and real held-out inference during MaxCore startup, distinguishing training bootstrap from serving.
3. Set readiness only after passing; publish structured failure reasons to callers.
4. Test missing/incompatible weights, degraded output and clean restarts against approved artifacts.
5. Accept after repeated startup qualifications match offline model evaluation and inference cannot bypass the gate.

**D — Immutable inference snapshots from training service.** Strong training/serving separation; more model lifecycle machinery.
1. Define immutable snapshot formats, architecture compatibility and evaluation approvals.
2. Make training export fully materialized, qualified snapshots rather than opportunistic partial loads.
3. Make inference consume only approved snapshot IDs and expose that identity in responses.
4. Test interrupted exports, mismatched tokenizers, snapshot rollback and task output quality.
5. Accept when every inference maps to an approved complete snapshot; random initialization remains training-only.

### AM-6 alternatives

**A — Bounded classified retries (recommended).** Smallest execution change; terminal failures need user-facing recovery.
1. Define retryable versus permanent renderer errors, total attempt/time budgets and cancellation semantics.
2. Replace the unconditional loop with classified bounded retry/backoff and a cancellation check.
3. Return terminal errors with remediation hints and implement explicit user retry using validated inputs.
4. Inject permanent and transient errors; verify worker release, eventual success and cancellation.
5. Accept when every job reaches a truthful terminal state within its budget without leaking render activity.

**B — Deadline-enforced isolated render workers.** Strong resource containment; adds process supervision.
1. Establish wall-clock, memory and CPU budgets per render class.
2. Execute each render in an isolated worker with a hard deadline and graceful/forced cancellation.
3. Translate worker outcomes into typed job states and permit bounded restarts only for transient failures.
4. Test hangs, memory pressure, deterministic bad inputs and worker termination.
5. Accept when a stuck renderer cannot outlive its job budget or block unrelated generation.

**C — Preflight plus resumable staged rendering.** Avoids repeated expensive work; larger pipeline refactor.
1. Split source validation, conditioning, synthesis, encoding and artifact validation into explicit stages.
2. Implement MaxCore preflight checks and stage-specific retry budgets/checkpoints.
3. Migrate the loop to a stage state machine with cancellation and precise terminal failure reasons.
4. Test permanent failures at every stage and transient restart from the correct completed stage.
5. Accept when invalid requests fail before expensive work and valid retries complete without infinite stage cycling.

**D — Bounded alternate render plans inside MaxCore.** Can recover unsupported combinations; must preserve user intent.
1. Define compatible alternative render plans and which changes require user approval.
2. Let MaxCore choose a finite plan set after preflight, with per-plan budgets and no semantic substitution.
3. Execute plans sequentially, report actual chosen parameters, and terminate when alternatives are exhausted.
4. Test all-plan failure, successful equivalent fallback, user rejection and budget exhaustion.
5. Accept when jobs either deliver an approved equivalent result or finish with an actionable failure within the total budget.

## Examined-surface inventory and boundaries

Examined current source: MaxCore app client/control/domain adapters and local supervisor references; external Node prediction proxy and canonical Python model initialization, training metric updates, engagement endpoint, audio renderer retry loop and video audio helpers; app AI analytics/model adapters and public AI/A&R consumers; social A/B generation/routes; studio audio generation handoff; social music-video uploads and active image-to-video handoff. Searches also covered studio/audio-processing/training routes, mixing/mastering adapters, diffusion/video services and related test filenames. Searches do not equal full line-by-line review or executed coverage.

Negative controls: `aiMusicService.ts:2201-2248` contains simulated missing-audio fallback, but source search found no active importing consumer beyond its own export and a self-evolution file reference; it is **not** promoted to a reachable release blocker. `audioGeneratorService.ts` similarly has legacy local synthesis/TTS fallback but no discovered TypeScript importer. Legacy `maxcore_server.py:1125-1145` contains heuristic predictions; the inspected local supervisor identifies canonical `server.py`, so this audit does not claim those legacy predictions are active. The canonical engagement route's unreachable heuristic body is not counted. Active image-to-video motion intensity is mapped correctly. Task proposals and historical claims were not treated as evidence.

Unexamined/unverified: live MaxCore identity and checkpoint contents, remote configuration, live dataset rights and coverage, real inference quality/latency, audio intelligibility, GPU execution claims, rendered media, client interaction, provider connectivity, complete DSP/plugin/studio editor behavior, all training corpus construction and every native model, full automated-test coverage. No screenshot is warranted for this read-only source report; no application behavior was changed or runtime started. Those boundaries prevent an “entire platform certified ready” conclusion. General persistence, release packaging, payments and the exempt Max assistant belong to other audit domains.