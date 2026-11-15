# Verification update: whole-codebase baseline and remediation

The baseline campaign completed with failures; it did not establish release
readiness. Its immutable reports are under
`generated-artifacts/whole-app-baseline/`.

- Browser discovery and analytics fixture startup were repaired. Their targeted
  reruns passed.
- The three failing Python contracts were reconciled with actual production
  behavior: silent output must be rejected, topic conditioning must include the
  requested topic, and delivery failure must retain a genuinely rendered audio
  artifact. All 47 cases across those files passed their targeted verification.
- The dependency audit identified GHSA-mrwp-f3q8-3g9p, GHSA-3g3m-2fjr-6pw4, and
  GHSA-g3hv-75wg-m249. The dependency floors and npm lockfile were updated.
  The subsequent full dependency audit reported zero known vulnerabilities.
  A real loopback redirect regression verifies credential removal with object
  and array headers and same-realm and cross-realm sensitive-header arrays.
  Full compatibility verification remains separate from the audit.
- The Stripe sandbox run passed 28 checks, with four blocked and one skipped.
  Blockers concern automatic-tax address configuration, Express login-link
  capability, inactive transfers, and disabled payouts. Existing API credentials
  are not equivalent to an enabled provider capability.
- The production install fixture remains blocked by the developer host's Nix
  size. The Rust concurrency fixture remains unverified: Nix cache permissions
  prevent one path, and the verified portable compiler fails during dynamic
  loading on this host. Neither gate was bypassed.
- The running application's script agent still rejects unreadable native output.
  Healthy HTTP probes and valid checkpoint files do not establish writing quality.
  Collaboration restoration is still metadata-only, as described above.

These findings do not close the twelve feature areas or their human-review
requirements. A post-fix full campaign is required for the changed source and
dependency graph; passing that campaign would still not certify missing features.

Additional primary research:

- Graves et al., original CTC paper:
  https://www.cs.toronto.edu/~graves/icml_2006.pdf — unsegmented sequence learning
  is a training/alignment method, not a substitute for acoustic training data.
- VBench, CVPR 2024:
  https://openaccess.thecvf.com/content/CVPR2024/html/Huang_VBench_Comprehensive_Benchmark_Suite_for_Video_Generative_Models_CVPR_2024_paper.html
  — separate temporal, visual, and conditioning dimensions rather than using
  encoder success as an overall quality score.
# Production readiness: research and acceptance design

Research date: 2026-10-31. This document is an engineering specification, not a
completion certificate. Implementation status remains in
`production-workflow-gap-register.md`.

## Scope and constraints

Preserve MaxCore's native generation architecture. Public technical descriptions
and documented interfaces are references; competitor implementations are not
being copied. Do not replace native generation with hosted generative APIs.
Live awareness is an input to generation, not proof of a model's competence.
Keep infrastructure liveness, valid media encoding, creative usefulness, and
whole-product production readiness as separate claims.

## Findings and implementation requirements

| Release area | Required implementation | Evidence needed to close it |
|---|---|---|
| Native writing | Task-conditioned learning for hooks, bodies, captions, and CTAs; retained source provenance; a frozen holdout independent of training; representative briefs and multiple seeds. | Complete, relevant, grammatical outputs, correct requested facts, no unsupported claims, and independently reviewed usefulness. A training-loss improvement or a short decode is not sufficient. |
| Awareness-driven planning | One immutable observation snapshot per campaign; typed decisions referencing actual observation IDs; explicit user constraints outrank inferred suggestions; separate planned decisions from rendered outcomes. | Change relevant observations and demonstrate justified changes in decisions. Unrelated observations must not arbitrarily rewrite the campaign. Missing measurements must be surfaced rather than invented. |
| Native image and video generation | Train and qualify the existing native visual components using actual image/video supervision, not just text summaries. Evaluate subjects, spatial relations, temporal consistency, motion, and controllability separately. | Real outputs from held-out briefs, decoded-artifact checks, repeated-seed evaluations, and blinded human ratings. Poster composition does not qualify subject generation. |
| Moving-footage editing | Owner-scoped source assets; explicit source in/out points; normalized timeline timebase; independently trimmed audio/video timestamps; ordered visual tracks, audio tracks, source gain/mute, and transitions. | Frame-boundary and audio-offset fixtures; variable-frame-rate inputs; non-zero source timestamps; truncated inputs; missing audio; overlap and crossfade boundaries; complete playback of the exported file. |
| Narration and audio | Preserve measured mastering. Add explicit pronunciation controls and timing metadata. Natural native speech requires qualified acoustic/waveform models with duration, pitch, and energy supervision or another independently validated native approach. | Intelligibility, pronunciation correctness, naturalness review, timing accuracy, stereo preservation, and measurements on final encodings. Loudness compliance cannot establish naturalness. |
| Speech captions | Distinguish authored scene captions, synthesis-event timings, and transcription of arbitrary recordings. Use real timing evidence, bounded cues, and explicit styling; export standards-compliant timed text. | Reference-aligned word errors and timing errors; punctuation and Unicode; long pauses; overlapping speech; edited clips; styling at each export aspect ratio. Do not distribute scene duration uniformly and call it transcription. |
| Cloud projects | Persist normalized project documents and immutable revisions, with media bytes in existing object storage. Atomic compare-and-swap revisions; idempotent autosave; account-scoped access; recover unsent local edits; collaborative edits reject or resolve conflicts explicitly. | Two-tab stale-write tests; cross-account denial; save interruption/retry; reload and recovery; asset retention across revisions; collaboration reconnects and explicit conflict resolution. Never silently overwrite a newer revision. |
| Coordinated campaigns | Persist a dependency graph linking briefs, source snapshots, brand versions, scripts, and media. Selective regeneration creates new versions only for affected nodes; preserve approved unaffected nodes. | Revise a single scene or caption and verify unaffected artifacts, IDs, and approvals remain intact. Retain provenance and identify stale descendants rather than replacing an entire campaign silently. |
| Brand kits/templates | Versioned, account-scoped logos, fonts, colors, voice/pronunciation settings, and layout constraints; template instantiation snapshots the version used. | Save/load, update/delete, cross-account checks, missing-font errors, and reproducible rendering from historical kit/template versions. |
| Platform exports | Versioned destination presets with geometry, codecs, frame rates, quality limits, and placement-specific safe areas; independent batch-job outcomes and resource admission. | Probe real exports and review safe areas against current destination documentation. TikTok safe zones vary with captions, placement, and overlays; a universal fixed inset is not a verified platform safe zone. |
| Persistent render jobs | Durable states, idempotent request identities, bounded workers, leases/heartbeats, ownership checks, execution cancellation, retry classification, immutable input references, and restart recovery. | Cancel during planning, synthesis, encoding, and delivery; kill a worker; retry after ambiguous storage acknowledgement; recover without duplicate delivery; prove cancellation cannot trigger retry or be overwritten by a late result. |
| Release certification | Whole-codebase tests, isolated provider journeys, realistic workload profiles, recovery/fault injection, human output review, and explicit thresholds tied to an exact source/model/configuration version. | Separate passed, failed, skipped, unavailable, and unreviewed results. No global readiness assertion based on test count or a self-reported internal score. |

## Architectural consequences

1. **Persist inputs before claiming restartable rendering.** The current durable
   delivery path can recover a completed artifact; a digest without source bytes
   cannot reconstruct an interrupted image/video job.
2. **Cancellation must reach execution.** A browser abort or journal flag alone
   does not stop a running encoder. Process shutdown needs bounded cleanup and
   must not accidentally become a retryable failure.
3. **Lease loss implies possible duplicate execution.** Treat commits as
   idempotent even if the worker framework reports normal completion.
4. **Separate a user's revision from the current project head.** An atomic
   expected-revision check must reject stale saves, including autosaves.
5. **Keep model research distinct from integration work.** Scaling results show
   the importance of data and compute, but cannot be used to invent a required
   token count or promised quality for this different native architecture.
6. **Evaluate narrow capabilities honestly.** Generated-narration timings may
   qualify captioning of that narration without qualifying transcription of
   uploaded recordings. A focused creative range can be production useful
   without claiming arbitrary subject generation or competitor parity.

## Primary references consulted

- Hoffmann et al., *Training Compute-Optimal Large Language Models*:
  https://arxiv.org/abs/2203.15556
  — data/compute/model-size tradeoffs, not a universal minimum for MaxCore.
- OpenAI, *Video generation models as world simulators*:
  https://openai.com/index/video-generation-models-as-world-simulators
  — multimodal visual training, temporal representations, and explicit limitations.
- Ren et al., *FastSpeech 2*:
  https://arxiv.org/abs/2006.04558
  — duration, pitch, and energy conditioning; this is research context, not an
  instruction to import its implementation or claim equivalent voice quality.
- W3C, *WebVTT*:
  https://www.w3.org/TR/webvtt/
  — timed cues and caption styling.
- FFmpeg filter documentation:
  https://ffmpeg.org/ffmpeg-filters.html
  — existing media-processing interfaces; individual filters must be checked
  against the installed runtime before implementation.
- PostgreSQL, *Explicit Locking*:
  https://www.postgresql.org/docs/current/explicit-locking.html
  — transaction/concurrency primitives for atomic revisions and job claims.
- BullMQ, *Cancelling Jobs* and *Stalled*:
  https://docs.bullmq.io/guide/workers/cancelling-jobs
  https://docs.bullmq.io/guide/jobs/stalled
  — cooperative cancellation and lease-loss behavior. Check installed-version
  interfaces; latest documentation is not proof a local method exists.
- NIST, *Generative Artificial Intelligence Profile*, AI 600-1:
  https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf
  — lifecycle evaluation, human oversight, monitoring, and risk evidence.
- InVideo, *How can I create a video using my script?*:
  https://help.invideo.io/en/articles/9382180-how-can-i-create-a-video-using-my-script
  — public workflow behavior for authored script, music, media, and subtitles.
- TikTok, *Auction In-Feed Ads*:
  https://ads.tiktok.com/help/article/tiktok-auction-in-feed-ads
  — safe-zone variations and destination specifications.
- Google Ads, *About video ad specs*:
  https://support.google.com/google-ads/answer/13547298?hl=en
  — recommended geometry and destination-safe placement references.

## Test campaign

`scripts/testing/run-all.py` is the existing whole-codebase orchestrator. The
initial baseline runs build, root CI, additional suites, coverage, Node, Python,
commerce, subsystem, browser, HTTP, page, load, operational, type, lint, audit,
and explicitly sandbox-only provider checks. Results are retained under the
ignored `generated-artifacts/whole-app-baseline` directory at workspace root.

This baseline is not the requested final post-remediation run. Changes made
after its source capture require new verification. Sandbox provider tests must
prove test mode before writes; missing credentials are blockers, not passes.
Do not deploy, use live payment credentials, or mutate production data as part
of this test campaign.

## Findings from the initial campaign

- Build passed. Main CI collected 2,874 cases with one failure; the coverage run
  collected 2,917 cases with the same failing prepared-release fixture.
- The prepared-release installer measures the entire local Nix store, currently
  approximately 47.3 GiB, against a 7.5 GiB budget including application payload.
  Do not waive that gate or report this as a measured production-image size.
- The initial isolated Node run recorded 729 passes, two failures, and two skips
  across 733 cases. Chromium discovery and analytics-fixture readiness were
  corrected; targeted reruns of both failing files and a new discovery regression
  passed. The original failure records remain intact.
- Several browser fixtures assumed a `/usr/bin` installation although Chromium
  was installed on the toolchain PATH. Discovery now respects explicit selections
  and executable PATH entries without suppressing missing-runtime failures.
- The analytics fixture's fixed startup-attempt count allowed only approximately
  four seconds. Its prepared Python runtime alone took approximately 3.2 seconds
  to import FastAPI/Uvicorn. A bounded readiness deadline now checks actual HTTP
  readiness and process exits, with bounded forced termination during cleanup.
- Inspection of the existing collaboration versions schema and restore route
  found metadata-only versions: restore changes `isCurrent` but does not restore
  project content. Do not reuse this as working cloud recovery. Fixing it requires
  genuine snapshots, atomic revision transitions, concurrent-edit protection,
  and corresponding client-state restoration.

The full campaign remains in progress; this is not its final result. The test
infrastructure fixes changed source inputs after the initial capture, so that
campaign cannot serve as the final post-remediation whole-codebase certificate.
