# Focused production-workflow target

This register defines the agreed focused InVideo-style target, not every
competitor feature or a claim of measured competitive parity.

Reference: InVideo's public editing documentation and AI video-editor product
description cover script, media, music, subtitles, narration and revision.
Only public behavior was consulted, not implementation/source code.

## Implemented in this increment

- Authored production projects with 1–8 editable/reorderable scenes.
- Individual scene durations, frame-aligned boundaries and caption exports.
- Supplied still images, logo compositing, color grades and transitions.
- Existing native instrumental synthesis integrated into the finished video.
- Existing local synthetic narration with music attenuation; requested speech
  failure is an error, not a music-only success.
- Strict rejection when narration is longer than the requested video.
- Portable project save/open, including assets; undo/redo and overwrite prompts.
- Script TXT, scene-caption SRT and durable MP4 output.
- Previous successful output retained after a failure, with stale-state labeling.
- Owned temporary media cleanup and source-payload digests in database journals.
- Authenticated bounded request parsing for larger scene-image payloads.

## Remaining acceptance requirements

| Area | Current evidence / unresolved requirement |
|---|---|
| Native script generation | Working text entry is not qualified generated writing. Need repeatable coherent, relevant scripts/captions/CTAs from representative briefs and held-out evaluation. |
| Awareness-to-creative planning | Snapshot/provenance exists; exact composition does not automatically convert observations into creative decisions. Need validated structured plans and source-grounded choices. |
| Native image generation | Poster and still composition exist. Arbitrary subject generation, consistent identity and creative range require qualified native checkpoints and evaluated outputs. |
| Moving footage | Still-scene composition works; uploaded clip trimming, source-audio choices, video-asset placement and moving subject generation are not implemented by this workspace. |
| Narration quality | Local synthetic speech works. Natural voice quality, broader languages, phonetic control and reliable pronunciation remain unqualified. No voice-cloning claim. |
| Audio finishing | Instrumentals and narration mixing exist; adaptive ducking, validated loudness/true-peak targets, and measured perceptual quality remain. |
| Captions | Exported cues represent authored scene text, not speech-aligned transcription. Word alignment, caption styles and transcription need implementation and validation. |
| Project persistence | Portable JSON projects are functional. Account-scoped cloud projects, revision history, autosave/recovery and collaboration remain. |
| Cross-modal campaign workflow | The video workspace does not yet orchestrate autonomous coordinated text/image/audio/video campaigns or targeted regeneration across them. |
| Brand controls | Logo and existing colors exist. Persisted brand kits, typography selection, layout-safe placement and reusable templates remain. |
| Platform delivery | Three aspect ratios exist. Platform-safe regions, batch exports, quality/resolution controls and destination-specific verification remain. |
| Job lifecycle | Durable existing delivery remains. This workspace's cancel stops waiting, not server execution. Persistent async progress and server cancellation/recovery need completion. |
| Operational readiness | Passing focused tests is not a concurrency benchmark, full provider-failure campaign or production deployment certification. |
| Quality certification | Need curated representative briefs, human review, measured failure rates and explicit per-modality release thresholds. |

None of the remaining rows is satisfied merely by adding a button or relabeling
procedural output as AI-generated. The full requested target is unfinished.
