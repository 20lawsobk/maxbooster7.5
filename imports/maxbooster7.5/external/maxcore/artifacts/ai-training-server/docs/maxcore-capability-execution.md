# MaxCore capability execution

## Target and evidence standard

The immediate target is the user's **level-75 temporary production milestone**,
with Google Veo representing the longer-term level-100 target. This is a milestone
metaphor, not a measured percentage of Veo performance. The 22 gates below are
workstreams, not a linear conversion to those levels.

The user further defines the intermediate target as **InVideo-level production
with a more focused range driven by MaxCore's awareness layers, systems, and
endpoints**. Treat this as a product-workflow reference, not a claim of feature
parity or a requirement to copy or integrate InVideo.

Prioritize the path from user intent and live awareness to an actionable brief,
coherent script, scene plan, assembled video, revisions, and delivered export.
Verify that relevant awareness changes production decisions while user intent
and explicit controls remain authoritative. Evaluate usefulness, consistency,
editability, and delivery in MaxCore's supported domain rather than requiring
general-purpose neural-video superiority before the intermediate release.
Native neural generation remains a separate capability to qualify; existing
procedural, compositing, and user-asset paths should be judged on their actual
output rather than mistaken for failed attempts at neural generation.

For the intermediate milestone, prioritize a bounded supported capability set
with useful real outputs, reliable end-to-end delivery, durable learning state,
honest capability reporting, and validated recovery/security behavior. Advanced
capabilities may remain outside the supported release scope, with their limits
disclosed; unavailable capabilities must not be advertised as working.
Competitive superiority is not a release prerequisite for this milestone.
Passing tests alone does not establish output quality or production readiness.

Enhance MaxCore's own engine until a controlled comparison demonstrates an
advantage over a specified Google Veo version. Do not substitute Veo for native
generation, claim wins from feature counts, or equate passing infrastructure
tests with output quality. The roadmap is a dependency map, not a promise that
all gates can be passed with the current data, compute, or implementation.

No complete capability level is certified by the work below.

## Capability gates

| Level | Gate | Current evidence / remaining requirement |
|---|---|---|
| 1 | Intended configuration reaches execution | Partial: local live-awareness route traced; diffusion request-input omission repaired. Full route/control audit remains. |
| 2 | Honest capability readiness | Partial: diffusion now rejects missing/incompatible state and propagates failures. Checkpoint presence does not prove training or quality. |
| 3 | Durable learning | Partial: development text-parent resumption verified; atomic diffusion bundles implemented. Production recovery and optimizer/corpus state need validation. |
| 4 | Correct learning mechanics | Text candidate numerical tests exist. Native video optimization and integrated learning require implementation/verification. |
| 5 | Intended source coverage | Peak text selector is restricted to Mastodon/Bluesky. Audit intended sources, usable modalities, freshness, and exclusions. |
| 6 | Meaningful performance signals | Source-relative ranking exists; outcome calibration and bias evaluation remain. |
| 7 | Multimodal learning observations | Establish traceable, usable frames/audio/timing from live sources rather than treating text summaries as video training data. |
| 8 | Task-aligned learning | Partial text-stage supervision added. Video objectives must teach the requested actions, controls, and temporal relationships. |
| 9 | Accumulating expertise | Parent-linked text learning verified. Held-out improvements, forgetting tests, and promotion rules remain. |
| 10 | Coherent production planning | Text output quality is not certified. Current diffusion conditioner is keyword-presence based, not a demonstrated general scene-understanding system. |
| 11 | Visual fidelity | No compatible learned diffusion checkpoint set is available in the inspected environment. Real output evaluation remains. |
| 12 | Temporal consistency | Exact terminal-frame handoff and request isolation tested. Generated identity/motion consistency remains unverified. |
| 13 | Motion and interaction | Native generated action/contact/occlusion/permanence evaluation remains. |
| 14 | Reliable controls | Some frame/reference routing tested. Demonstrate effects of each control in generated output, not just argument forwarding. |
| 15 | Longer coherent sequences | Establish duration-specific quality and continuity gates using actual output. |
| 16 | Multi-shot direction | Establish stable subject/location/chronology across generated shots. |
| 17 | Audio-visual coordination | Validate generated sound timing, requested events, music alignment, and speech synchronization where supported. |
| 18 | Targeted revision | Demonstrate localized changes without damaging unaffected content. |
| 19 | Efficient execution | Benchmark real quality/latency/memory/throughput/cost; virtual resource counts are not performance evidence. |
| 20 | Production resilience | Validate load, recovery, cancellation, storage failures, access isolation, and completed-asset delivery. |
| 21 | Broad quality consistency | Run repeated held-out prompts across representative categories and publish failures alongside successes. |
| 22 | Competitive advantage | Pin a Veo version and supported comparison settings; conduct blinded matched evaluation with predefined criteria and uncertainty estimates. Not run. |

## Current diffusion findings

- Loading previously ignored missing/incompatible components and could retain
  random initialization. Loading now requires complete compatible parameters.
- Reload validates fresh modules before replacing the live set. Inference and
  replacement are synchronized.
- Serving detects published checkpoint changes instead of indefinitely reusing
  an old singleton. Unstable or invalid updates fail explicitly; existing
  requests retain their already-selected model instance.
- Saving previously wrote independent component files and swallowed errors.
  New saves atomically publish a complete parameter bundle; interrupted saves
  before publication preserve the previous file.
- The configured private model-state location is now honored by diffusion and
  its readiness inspection. Unconfigured legacy installations retain their
  historical location; this is not proof of production durability.
- The request's idea/platform/tone previously did not reach the conditioner.
  They now accompany awareness. The existing vocabulary still limits what
  conditioning can represent; this is not a claim of general prompt adherence.
- The media-learning preflight still returns blocked. Completing its video
  training/admission path and obtaining qualified weights are unresolved work,
  not deficiencies that may be hidden by random initialization.

## Verification boundaries

Small tensor-module fixtures test serialization and failure behavior, not visual
quality. Encoded-color clips test exact frame selection, not learned generation.
Real diffusion tests without checkpoints are explicitly skipped; a present but
broken checkpoint must fail rather than be silently skipped. Evidence is under
generated-artifacts/diffusion-integrity and subsequent verification directories
in the workspace root.

The final targeted run recorded 50 cases: 45 passed and 5 skipped for absent
real diffusion checkpoints, with no failures/errors. Results are in
generated-artifacts/diffusion-integrity-release-check/results.json.

The restarted application renders its landing page, but runtime logs still show
ScriptAgent rejecting unreadable output or output without a usable CTA. MaxCore
startup readiness remains degraded. Database probing recovered after an initial
failure. These observations do not certify generation quality or production
readiness, and the script rejection checks have not been weakened.
