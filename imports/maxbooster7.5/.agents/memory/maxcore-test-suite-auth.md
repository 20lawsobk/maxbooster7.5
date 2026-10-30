---
name: MaxCore test-suite auth
description: How to authenticate the imported MaxCore pytest suites against the live local instance
---
- All endpoint suites under external/maxcore/artifacts/ai-training-server/tests/ read MAXCORE_TEST_API_KEY (and MAXCORE_TEST_BASE, default http://127.0.0.1:9878). Run: `MAXCORE_TEST_API_KEY="$MAXCORE_ADMIN_KEY" python3 -m pytest tests/ -q`.
- **Why:** hardcoded keys in the repo (hex generation key, mbs_ admin_key.txt) are NOT registered in this instance's api_keys table — they always 401. The app's MAXCORE_ADMIN_KEY works via the server's env-bypass keys.
- Exclusions: test_smoke_load.py / test_w6_90m.py (heavy load), ai_model/maxcore/tests/endpoint_load_test.py (sys.exit at import — always --ignore it when running `pytest ai_model`).
