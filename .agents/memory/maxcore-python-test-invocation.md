---
name: MaxCore Python test invocation
description: How the imported MaxCore ai-training-server test suite actually runs in this workspace, and which files cannot run here.
---
Run from external/maxcore/artifacts/ai-training-server with `PYTHONPATH=".:tests"` and python_runtime's python3: `python3 -m unittest tests.<module>`. Several tests import sibling test modules by bare name, so without `tests` on the path they fail with ModuleNotFoundError (looks like a code bug, isn't).
- pytest is NOT installed in python_runtime or system python; pytest-style files (some without `import pytest`) report "Ran 0 tests" (rc=5) under unittest — classify as blocked, not passed.
- starlette's TestClient needs `httpx2`, which is missing, so TestClient-based cases error out (environment gap).
- Files hitting a live MaxCore (test_all_endpoints, test_content_endpoints, test_awareness_and_quality, test_smoke_load, test_veo_parity, test_w6_90m, test_audio_bpm_key_match, test_original_quality_runner) need a running server + admin key.
- test_public_peak_curriculum's capability case needs a fresh public awareness snapshot; without one it raises AwarenessUnavailable instead of the expected ValueError.
**Why:** cost several reruns to separate invocation errors from real failures.
**How to apply:** use this invocation and classification before reporting Python test results.
