# MaxCore existing offline test inventory

Date: 2026-09-23  
Working directory: `external/maxcore/artifacts/ai-training-server`  
Runtime: `/home/runner/workspace/.pythonlibs/bin/python3` (Python 3.13.11, pytest 9.1.1)

## Result

**PASS for the selected credential-free, offline scope: 494 passed, 8 skipped, 0 failed, 0 collection errors.**

This is not a full-suite result and is not evidence of full model inference. It covers existing safety contracts, reference/native kernels, backend selection, bounded media/audio analysis, local API contracts, awareness logic, and voiceover logic. No test was changed or weakened, and no product-code fix was needed.

Seven separately capped pytest groups were executed:

| Group | Files | Result | Elapsed |
|---|---:|---:|---:|
| Safety/HTTP/inference contracts | 5 | 33 passed, 6 unittest subtests passed | 46.11 s |
| Resource/hardware/precision/backend | 4 | 36 passed | 4.77 s |
| Native and Digital GPU kernels | 5 | 173 passed | 2.00 s |
| MaxCore orchestration/SIMT/core | 3 | 72 passed | 33.06 s |
| Audio/media/voiceover | 7 | 50 passed, 8 skipped | 32.20 s |
| Awareness/native analysis/RTA/retrieval | 11 | 124 passed | 83.15 s |
| Native-analysis in-process API | 1 | 6 passed | 7.65 s |

Each group used `timeout 120s`, a private scratch `HOME`/`TMPDIR`/`XDG_CACHE_HOME`, `env -i`, the project root as `PYTHONPATH`, and:

```text
OMP_NUM_THREADS=1
OPENBLAS_NUM_THREADS=1
MKL_NUM_THREADS=1
NUMEXPR_NUM_THREADS=1
VECLIB_MAXIMUM_THREADS=1
BLIS_NUM_THREADS=1
CUDA_VISIBLE_DEVICES=
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1
PYTHONDONTWRITEBYTECODE=1
```

The shell imposed `RLIMIT_AS=1,258,291 KiB` (about 1.2 GiB) on each pytest group. No API key, admin credential, database URL, or storage credential was supplied. The test process was never pointed at a listening server.

## Executed files

Legend: **real** means local production implementation/kernel logic ran; **fake** identifies an intentional test double or mocked transport.

| Existing test file | Outcome | What actually ran |
|---|---|---|
| `ai_model/audio/test_audio_analysis.py` | pass | Real bounded NumPy/librosa waveform analysis; synthetic in-memory signals. |
| `ai_model/generation/test_campaign.py` | pass | Real deterministic campaign composer; no model/network. |
| `ai_model/gpu/native/tests/test_native_kernels.py` | pass | Real local native compiler/kernels in scratch cache and numerical comparisons. |
| `ai_model/gpu/tests/test_digital_backend_bridge.py` | pass | Real Digital GPU bridge/reference arrays. |
| `ai_model/gpu/tests/test_digital_gpu_comprehensive.py` | pass | Real local Digital GPU/HyperCore/PocketAccelerator kernels on bounded synthetic arrays. |
| `ai_model/gpu/tests/test_kernels.py` | pass | Real local attention/convolution kernels against independent references. |
| `ai_model/gpu/tests/test_silicon_model.py` | pass | Real kernel results plus the explicitly labeled what-if performance model; not physical silicon proof. |
| `ai_model/maxcore/backend/tests/test_select_backend.py` | pass | Real availability/selection; CUDA hidden, CPU validation and Digital GPU fallback exercised. One deliberate fake fault probe. |
| `ai_model/maxcore/tests/test_gpu_native_orchestration.py` | pass | Real bounded graphs, scheduler, memory pool, shared-memory transport, and kernels. |
| `ai_model/maxcore/tests/test_hardware.py` | pass | Real thread planner with controlled environment mutations. |
| `ai_model/maxcore/tests/test_maxcore.py` | pass | Real bounded MaxCore graph/runtime/reference operations and in-memory orchestration. |
| `ai_model/maxcore/tests/test_precision.py` | pass | Real NumPy INT8/INT4 reference numerics; no performance claim. |
| `ai_model/maxcore/tests/test_resource_plan.py` | pass | Real planner; synthetic host overrides plus bounded host sanity checks. |
| `ai_model/maxcore/tests/test_silicon_simt_backend.py` | pass | Real SIMT backend/reference kernels on bounded shapes. |
| `ai_model/native_analysis/test_text.py` | pass | Real deterministic native text analysis. |
| `ai_model/native_analysis/test_website.py` | pass | Real HTML analysis over inline fixtures; no fetch. |
| `ai_model/retrieval/test_retrieval.py` | pass | Real index/watchdog algorithms with clearly defined in-memory `FakeStorage`. |
| `ai_model/rta/test_render_contracts.py` | pass | Real bounded image/video/audio fabric kernels and two local subprocess renders; no pretrained weights. |
| `ai_model/test_quality_awareness.py` | pass | Real deterministic awareness quality logic. |
| `tests/test_audio_auto_growth.py` | pass | Real growth decision logic; seeder replaced by explicit mocks, so no dataset/network write. |
| `tests/test_audio_seeding_guard.py` | pass | Real guard logic/source contracts with isolated module loading; no server import/start. |
| `tests/test_awareness_conditioner.py` | pass | Real deterministic conditioning logic. |
| `tests/test_beat_context.py` | pass | Real beat-context and platform-constraint logic. |
| `tests/test_intent_url_reader_safe_http.py` | pass | Real parser with explicit fake safe transport; no network. |
| `tests/test_isolated_audio.py` | pass | Real isolation/cleanup logic and bounded local subprocess fixtures in pytest temp paths. |
| `tests/test_media_delivery_contract.py` | pass | Real checkpoint completeness and media contracts using tiny tensors; ffprobe/ffmpeg subprocess results explicitly mocked. |
| `tests/test_native_analysis_api.py` | pass | In-process FastAPI `TestClient`, temp assets, and fake authenticated scope; no listening server/network. |
| `tests/test_native_analysis_safe_http.py` | pass | Real SSRF/redirect/header policy with fake DNS/connections; no network. |
| `tests/test_native_media_analysis.py` | pass/skip | Real local image measurements and typed failures. Video fixture test skipped because ffmpeg is absent from the sanitized PATH. |
| `tests/test_platform_awareness_wiring.py` | pass | Static/local wiring contracts. |
| `tests/test_sast_runtime_remediation.py` | pass | Real tensor cache/process error logic; endpoint-load URL validation only, no requests. |
| `tests/test_social_ad_beacon.py` | pass | Real signal parsing and sanitization over inline data. |
| `tests/test_trusted_http.py` | pass | Real origin policy with fake resolver and pinned connection; no network. |
| `tests/test_unavailable_inference_contracts.py` | pass | AST endpoint contracts plus real tiny-waveform analysis; no model load. |
| `tests/test_url_label_garble_guard.py` | pass | Real deterministic garble detection. |
| `tests/test_voiceover.py` | pass/skip | Text/contract logic passed. Seven synthesis/mix tests skipped because `espeak-ng` is not installed; no suppression or install attempted. |

Warnings were limited to expected librosa warnings for tiny/empty synthetic signals (19 warning instances across the relevant groups). They did not produce failures.

## Existing files not executed this pass

These are explicit scope/safety decisions, not arbitrary sampling:

| Existing test file | Skip reason |
|---|---|
| `ai_model/maxcore/tests/endpoint_load_test.py` | Executable HTTP load harness requiring a configured admin key and a real local target; prohibited server/load pass. |
| `ai_model/maxcore/tests/load_test.py` | Standalone load benchmark rather than pytest unit tests; omitted under the no-load/CPU-training and bounded-resource requirements. |
| `ai_model/retrieval/test_phase4.py` | Writes generated assets to the repository-level uploads directory rather than only pytest scratch. |
| `ai_model/retrieval/test_pipeline.py` | Explicit real-asset pipeline that renders/writes into the repository uploads library. |
| `ai_model/retrieval/test_rcgs.py` | Creates image fixtures in the repository uploads directory; not isolated to private scratch. |
| `tests/test_all_endpoints.py` | Live HTTP endpoint inventory requiring a running server and optional credentials. |
| `tests/test_audio_bpm_key_match.py` | Live HTTP/API test with configured base/key paths. |
| `tests/test_awareness_and_quality.py` | Live server HTTP quality suite (`MAXCORE_TEST_BASE`); no real server startup allowed. |
| `tests/test_content_endpoints.py` | Live HTTP endpoint suite requiring a running server/key. |
| `tests/test_diffusion_frame_resolution.py` | Initializes the diffusion pipeline and its randomly initialized/heavy model path; not needed for bounded native-kernel proof and not genuine trained inference. |
| `tests/test_native_awareness_cascade.py` | Imports the full `server` module and exercises endpoint globals; excluded under no real server initialization for this pass. |
| `tests/test_smoke_load.py` | Live HTTP concurrency/load harness. |
| `tests/test_social_generation_controls.py` | Includes full `server` import and URL-opener cases; collection was intentionally avoided under the no-server/uncertain-network-fixture rule. |
| `tests/test_veo_parity.py` | Live API/server parity test requiring configured base/key. |
| `tests/test_voiceover_api.py` | Live HTTP API/job polling suite requiring a running server. |
| `tests/test_w6_90m.py` | Explicit 90-minute/live HTTP workload; prohibited. |

## Checkpoint finding

The active server loader is not extension-guessing:

* `server.py` constructs exactly `ai_model/weights/model.pt`.
* It calls `torch.load(..., map_location=...)`, restores tokenizer metadata when present, extracts `model_state_dict` (or treats the object as the state dict), and then uses the complete-checkpoint validation path before inference.
* `ai_model/gpu/gpu_trainer.py` expects `ai_model/weights/model_gpu.pt` and optionally the same base `ai_model/weights/model.pt`; `hyper_trainer.py` additionally checks `model_hyper.pt`.

Current disk state has no active `model.pt`. It has `ai_model/weights/model.corrupt` (109,368,185 bytes). Non-loading inspection reports a ZIP archive with 76 PyTorch-style entries including `model/data.pkl`, format metadata, byte order, and tensor storage members. This establishes that it is a checkpoint-shaped PyTorch ZIP container; it does **not** establish that it is proprietary, valid, or corrupt.

The only repository mechanism found that creates the `.corrupt` name is `workers/watchdog.py`: after `torch.load(model.pt, weights_only=False)` raises, it renames `model.pt` to `model.corrupt`. No retained log or exception provenance explaining this particular file's quarantine was found. Therefore this report does **not** claim genuine corruption merely from the suffix. The file was not loaded because it is about 109 MB and this pass explicitly prohibited the 90M/model-load path. The active loader ignores it because the expected path is `model.pt`, not because of guessed format semantics.

## Readiness conclusion

The selected existing offline surface is green. Safety boundaries, unavailable-inference honesty, bounded native/reference compute, local media analysis, and deterministic awareness logic have direct test evidence. Voice synthesis remains unverified in this environment due to the missing `espeak-ng` executable, video media analysis is partially unverified due to missing ffmpeg, and no claim is made for trained checkpoint inference, live endpoints, remote storage, databases, or production GPU hardware.