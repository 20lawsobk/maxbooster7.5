# Native MaxCore awareness audit

## Authority and method

Audited against `replit.md`, `.agents/memory/awareness-conditioning-contract.md`,
and `.agents/memory/awareness-centralization-transport-injection.md`.
MaxCore remains the sole conditioning authority. No application-side inference,
synthetic awareness, fallback generation, or Max knowledge-assistant changes were
introduced.

The active native service is
`external/maxcore/artifacts/ai-training-server/server.py`, started by the
MaxCore API server launcher/start script. The similarly named
`maxcore_server.py` is an inactive historical standalone stub (its own source
notes that active video generation lives in `server.py`); it was not promoted or
presented as a real generation system.

## Coverage inventory

| Surface | Native consumer | Result |
|---|---|---|
| Text/content | `/content/generate`, `/api/generate/content`, `/api/generate/text`, compatibility `/generate/text` | Caller direction, URL/intent, caller awareness, and real platform/quality context reach `ScriptRequest` and `DistributionRequest`. Text/content coalescer identities now use the same effective awareness consumed by the agents. |
| Social | `/platform/social/generate`, `/platform/social/autopilot` | Social generation already used effective awareness. Autopilot now does too. URL-derived signals and platform controls remain MaxCore-owned. |
| Image | `/api/generate/image`, compatibility `/generate/image` | Each slot computes platform-local effective awareness before `VisualSpecRequest`. The literal typography prompt remains clean; awareness is not concatenated into buyer-visible headline text. Procedural rendering itself is deterministic and does not receive irrelevant inference. |
| Video | `/platform/video/generate`, `/api/generate-video`, `/api/video/generate-ai`, `/api/video/extend`, compatibility `/generate/video` | Effective awareness reaches script, visual, distribution, intelligence brief, and `VideoAgentRequest` consumers. Platform video coalescing uses that exact effective value. Extension now accepts the shared awareness/direction fields instead of silently dropping them. |
| Audio | `/api/generate/audio`, compatibility `/generate/audio` | Effective awareness drives the concept agent and the existing real genre/mood/sample-selection path. Active audio-job identity now includes effective awareness, preventing cross-direction job sharing. |
| Advertising | `/platform/ads/generate`, `/platform/ads/optimize`, `/api/optimize/ad` | Ad generation/optimization model seams use effective awareness. `AdGenerateRequest` now shares structured-awareness normalization and accepts description, URL, instruction, extra context, and themes. |
| Campaign | `/api/generate/campaign` | Shared campaign awareness reaches the planner; each post now appends its own real platform quality layer at the per-post composer. Optional teaser video receives effective platform awareness through the shared video job path. Procedural campaign still images do not invoke irrelevant inference. |
| DAW/distribution | `/platform/daw/generate`, `/platform/distribution/plan` | Script/visual/distribution agents now receive effective awareness rather than only the base merge. |
| Analysis/scoring with a model seam | `/analyze`, `/api/analyze`, `/api/analyze/sentiment`, `/api/content/score`, `/api/optimize/ad` | Model-backed branches use the shared cascade. Deterministic waveform analysis is intentionally not awareness-conditioned. |
| Mixing/mastering | `/api/audio/mixing-recommendation`, `/api/audio/mastering-recommendation` | These are deterministic decisions from measured PCM features, not generative model calls. No irrelevant awareness inference added. |

## Honest absent/unavailable systems

- `/api/predict/engagement` explicitly returns 503 because a trained engagement
  predictor is unavailable. Its historical heuristic/random implementation is
  unreachable.
- `/api/infer/viral-score` explicitly returns 503 because trained video scoring
  inference is unavailable.
- Native mixing/mastering is measured deterministic DSP recommendation logic,
  not a generative AI mixing/mastering model.
- Compatibility media endpoints that return asset specifications are not claimed
  to render media unless they dispatch to an actual native agent/renderer.

## Fix evidence

- Shared `_AwarenessMixin` now owns all standard accepted conditioning fields,
  structured `{contextString: ...}` normalization, and the app-forwarded
  `intent` / `direction` / `context` envelope. Structured envelope values are
  serialized as stable JSON (never Python object repr) in the existing native
  cascade.
- All repaired model seams follow `_merged_awareness_for(...)` then
  `_effective_awareness(...)`, with per-platform evaluation for multi-slot paths.
- Audio and platform-video coalescing identities include the effective awareness
  actually consumed by generation.
- Campaign posts append platform-local quality awareness at their real composer
  consumer.
- Regression tests exercise typed transport normalization and actual DAW,
  distribution, and campaign consumer paths; source guards cover the two
  asynchronous coalescer identity seams without launching costly generation.

Focused command run:

```text
python3 -m pytest -q \
  tests/test_native_awareness_cascade.py \
  tests/test_platform_awareness_wiring.py \
  tests/test_social_ad_beacon.py \
  ai_model/generation/test_campaign.py
```

Result: **18 passed**. Two pre-existing FastAPI `on_event` deprecation warnings;
no failures. Python compilation also succeeded for the changed native files and
regression test. No workflow restart, browser run, TypeScript check, or live
generation was performed.

## Final combined offline native regression

Run with the application stopped and with remote storage/database variables
removed. The test process redirected `storage_client._DiskStore._DB_PATH`,
`HOME`, `XDG_CACHE_HOME`, and `TMPDIR` to a disposable `/tmp` tree, disabled the
shared dedup cache, and deleted that tree after pytest. Consequently this run
made no shared storage/database writes.

Exact final command:

```bash
cd external/maxcore/artifacts/ai-training-server && TEST_ROOT="$(mktemp -d /tmp/maxcore-native-regression.XXXXXX)" && env -u DATABASE_URL -u PGHOST -u PGDATABASE -u PGUSER -u PGPASSWORD STORAGE_HTTP_URL= STORAGE_BEARER_TOKEN= DEDUP_CACHE_ENABLED=0 HOME="$TEST_ROOT/home" XDG_CACHE_HOME="$TEST_ROOT/cache" TMPDIR="$TEST_ROOT/tmp" TEST_ROOT="$TEST_ROOT" bash -c 'mkdir -p "$HOME" "$XDG_CACHE_HOME" "$TMPDIR"; python3 -c '\''import os
from pathlib import Path
import storage_client
storage_client._DiskStore._DB_PATH = Path(os.environ["TEST_ROOT"]) / "local_kv.db"
import pytest
raise SystemExit(pytest.main(["-q", "tests/test_native_awareness_cascade.py", "tests/test_platform_awareness_wiring.py", "tests/test_awareness_conditioner.py", "ai_model/test_quality_awareness.py", "tests/test_social_generation_controls.py", "tests/test_social_ad_beacon.py", "tests/test_beat_context.py", "tests/test_url_label_garble_guard.py", "tests/test_unavailable_inference_contracts.py", "tests/test_native_analysis_safe_http.py", "tests/test_native_media_analysis.py", "ai_model/native_analysis/test_text.py", "ai_model/native_analysis/test_website.py", "ai_model/audio/test_audio_analysis.py", "tests/test_audio_auto_growth.py", "tests/test_audio_seeding_guard.py", "tests/test_audio_bpm_key_match.py", "-k", "not TestAudioBpmKeyMatchE2E", "tests/test_voiceover.py", "ai_model/generation/test_campaign.py", "ai_model/rta/test_render_contracts.py"]))'\''; status=$?; rm -rf "$TEST_ROOT"; exit $status'
```

Result: **202 passed, 7 skipped, 5 deselected**, with 20 warnings, in
137.96 seconds. The seven skips are the environment-gated `espeak-ng`
voiceover-render tests. The five deselections are the stopped-server audio
BPM/key HTTP integration class. Warnings are the two existing FastAPI
`on_event` deprecations plus expected librosa short-waveform analysis warnings.

The combined pass covers awareness transport/conditioning/quality, social and
ad controls, beat and campaign generation contracts, URL garble and SSRF
guards, unavailable-inference provenance, durable job/audio ownership source
contracts, safe native HTTP analysis, native text/website/image/video/audio
analysis, isolated audio growth/seeding/selection, offline voiceover helpers,
and deterministic RTA rendering.

Explicit exclusions:

- `tests/test_awareness_and_quality.py`, `tests/test_content_endpoints.py`,
  `tests/test_all_endpoints.py`, `tests/test_smoke_load.py`,
  `tests/test_voiceover_api.py`, the two HTTP cases in `tests/test_veo_parity.py`,
  and `TestAudioBpmKeyMatchE2E`: require a running server and/or real model.
- `tests/test_native_analysis_api.py` initially could not collect because
  Starlette 1.x TestClient requires its optional `httpx2` transport. The
  bounded test-only dependency `httpx2>=2.0.0,<3` is now declared in the root
  Python runtime manifest/lock and installed through supported Replit package
  management. No FastAPI/Starlette/TestClient API was changed.
- Diffusion, GPU, MaxCore hardware/load/precision, retrieval pipeline,
  checkpoint/model-load, training, and `test_w6_90m.py` suites were excluded as
  costly model/load/train or unrelated hardware/integration coverage.

No production defect was found during this final run, so no implementation
files were edited.

### Native analysis route follow-up

The formerly blocked six TestClient route tests were then run alone with the
same disposable storage/database isolation:

```bash
cd external/maxcore/artifacts/ai-training-server && TEST_ROOT="$(mktemp -d /tmp/maxcore-native-api.XXXXXX)" && env -u DATABASE_URL -u PGHOST -u PGDATABASE -u PGUSER -u PGPASSWORD STORAGE_HTTP_URL= STORAGE_BEARER_TOKEN= DEDUP_CACHE_ENABLED=0 HOME="$TEST_ROOT/home" XDG_CACHE_HOME="$TEST_ROOT/cache" TMPDIR="$TEST_ROOT/tmp" TEST_ROOT="$TEST_ROOT" bash -c 'mkdir -p "$HOME" "$XDG_CACHE_HOME" "$TMPDIR"; python3 -c '\''import os
from pathlib import Path
import storage_client
storage_client._DiskStore._DB_PATH = Path(os.environ["TEST_ROOT"]) / "local_kv.db"
import pytest
raise SystemExit(pytest.main(["-q", "tests/test_native_analysis_api.py"]))'\''; status=$?; rm -rf "$TEST_ROOT"; exit $status'
```

Result: **6 passed in 1.50 seconds**. This closes the prior route-level evidence
gap for generation authorization, trusted owner identity, upload ownership and
expiry, traversal/MIME/size/decode rejection, cleanup, and concurrency capacity.