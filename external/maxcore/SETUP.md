# MaxCore — Setup & Operations Guide

This document describes how the imported **MaxCore** repository (`external/maxcore`)
is set up, configured, and run **inside Max Booster**, plus how to run its test
suites and what is currently known to fail. Everything below is derived from the
actual source in this repo — not from upstream documentation.

---

## 1. What MaxCore is in this project

MaxCore is the **internal AI subsystem of Max Booster**. It provides the model /
inference / generation backend (audio, image, text, video) and its own training,
storage-awareness and control machinery. It is a self-contained multi-service
application imported wholesale into `external/maxcore`.

In Max Booster it does **not** run standalone. It is launched as a **supervised
child process** by:

- `server/services/maxcoreLocalSupervisor.ts`

### Process topology

The supervisor spawns the imported **Node api-server**, not the Python service
directly. That Node layer then owns the Python AI service lifecycle (warm-up,
hung-detection, `/uploads` proxy). None of the imported source is modified.

```
Max Booster main server (port 5000)
        │  loopback HTTP (Authorization: Bearer …)
        ▼
maxcoreLocalSupervisor.ts
        │  spawn: tsx src/index.ts   (cwd artifacts/api-server)
        ▼
MaxCore api-server (Node/Express)  ── PORT = MAXCORE_LOCAL_PORT (default 8090)
        │  owns + proxies
        ▼
Python AI service (server.py)      ── MODEL_API_PORT (default 9878)
                                      + healthz thread on MODEL_API_PORT+1 (9879)
```

- **Main loopback port: 8090** — set via `MAXCORE_LOCAL_PORT`
  (`server/config/index.ts`, `maxcoreLocal.port`, `Number(p.MAXCORE_LOCAL_PORT) || 8090`).
  The supervisor spawns the child with `PORT = <that port>`.
- **Health check: `GET /api/health`** on port 8090. The api-server
  (`artifacts/api-server/src/routes/model-proxy.ts`) proxies `/api/health` to the
  Python service's `/api/health`, which returns `{"status": "healthy",
  "model_loaded": <bool>}`. The supervisor's `checkMaxcoreLocalReady()` treats the
  subsystem as **ready only when `status === "healthy"`** (a lightweight Node-only
  `/healthz` answers even while Python is crash-looping, so it is intentionally
  **not** used for readiness).
- **Second model-API port: 9878** — the Python AI service's own API port,
  configured via `MODEL_API_PORT` (`server/config/index.ts`, `maxcoreLocal.modelApiPort`,
  `Number(p.MODEL_API_PORT) || 9878`). The supervisor passes `MODEL_API_PORT` to
  the child; setting it marks that api-server instance as the **Python owner**
  (see `PYTHON_SPAWN_DISABLED` logic in `artifacts/api-server/src/python-server.ts`).
  A third internal port `MODEL_API_PORT + 1` (9879) hosts a dedicated Python
  liveness/`/healthz` daemon thread used for hung-detection.

### Schema isolation

The Python service persists API keys / training state in Postgres and shares Max
Booster's database, but is confined to its own `maxcore` schema. The supervisor:

- rewrites the DB URL with `options=-csearch_path=maxcore` (`withMaxcoreSchema`),
  using the un-pooled Neon host because the pooler rejects the `options` startup
  parameter, and
- runs `CREATE SCHEMA IF NOT EXISTS maxcore` before each spawn (`ensureMaxcoreSchema`).

### Restart / lifecycle

The supervisor restarts the child on crash with exponential backoff
(2 s → 60 s cap; a run ≥ 60 s resets the backoff), sweeps the child's whole
process group on exit (so cluster workers / the Python child are not orphaned),
and stops it cleanly on shutdown via `SIGTERM` (escalating to a process-group
`SIGKILL` after 8 s).

On a clean checkout where the nested workspace is not yet installed, the
supervisor auto-runs `scripts/bootstrap-maxcore.sh` before the first spawn.

---

## 2. Python runtime + dependency setup

The Python AI service lives at:

- `external/maxcore/artifacts/ai-training-server/`
  - `server.py` — the FastAPI application actually spawned in Max Booster
    (the Node layer runs `uv run python3 <…>/ai-training-server/server.py`).
  - `maxcore_server.py` / `run_maxcore.py` — an alternative standalone
    "indestructible supervisor" entrypoint (see §7). Not used under Max Booster.

### Python version

- **Python ≥ 3.11** is required — `artifacts/ai-training-server/pyproject.toml`
  declares `requires-python = ">=3.11"`. The nested `.replit` pins
  `python-3.11`; this Max Booster workspace currently provides Python 3.12,
  which satisfies the constraint.

### Dependencies

There is **no `requirements.txt`**. Dependencies are declared in
`artifacts/ai-training-server/pyproject.toml` and locked in `uv.lock`, installed
with **[uv](https://docs.astral.sh/uv/)**. Core runtime dependencies:

- `fastapi`, `uvicorn`, `pydantic`
- `torch` (installed from the **CPU** PyTorch index configured in `pyproject.toml`
  — this workspace is CPU-only)
- `numpy`, `scipy`, `scikit-learn`
- `librosa`, `soundfile`, `pillow` (audio/image processing)
- `psycopg2-binary` (Postgres)

Several native libraries are needed for audio/image codecs (declared in the
nested `.replit` `[nix]` section): `ffmpeg-full`, `libsndfile`, `espeak-ng`,
`freetype`, `libjpeg`, `libwebp`, `libtiff`, `openjpeg`, `zlib`, `pkg-config`,
etc.

### Installing deps in this Replit workspace

The normal Max Booster workflow is self-contained: on first run the supervisor
invokes `scripts/bootstrap-maxcore.sh`, which:

1. installs the nested **Node** workspace (`pnpm install`) if
   `artifacts/api-server/node_modules/.bin/tsx` is missing, and
2. installs the **Python** deps (`uv sync`, run from `artifacts/ai-training-server`)
   if `import fastapi, uvicorn` fails.

To do it manually:

```bash
bash scripts/bootstrap-maxcore.sh
# or, Python deps only:
cd external/maxcore/artifacts/ai-training-server && uv sync
```

`uv` (0.9.x) and `python3` are already available on `PATH` in this workspace.

---

## 3. Environment variables MaxCore consumes

### Ports & mode

| Variable | Default | Meaning |
|---|---|---|
| `MAXCORE_LOCAL` | (unset ⇒ enabled) | `MAXCORE_LOCAL=0` disables local mode and points Max Booster at a remote MaxCore via `MAXCORE_URL` / `AI_SERVER_URL`. |
| `MAXCORE_LOCAL_PORT` | `8090` | Loopback port the api-server binds (`PORT` of the child). |
| `MODEL_API_PORT` | `9878` | Python model-API port; also marks the api-server instance as the Python owner. |

### Auth keys

The connector sends a key to MaxCore; the api-server forwards it and the Python
service also accepts the same values via env-bypass. Resolution
(`server/config/index.ts`):

- `maxcoreGenerationKey` = `AI_SERVER_KEY` → `MAXCORE_ADMIN_KEY` → derived key.
- `maxcoreAdminKey` = `MAXCORE_ADMIN_KEY` → derived key.
- The supervisor passes `ADMIN_KEY = maxcoreAdminKey` and
  `AI_SERVER_KEY = maxcoreGenerationKey` into the child env; the Python service
  treats those exact env values as admin/bypass keys
  (`_ENV_BYPASS_KEYS` in `server.py`).

**Loopback keys are derived from `SESSION_SECRET` when none are configured.**
In local mode with no explicit key, `_maxcoreDerivedKey(scope)` returns:

```
"mclocal-" + HMAC_SHA256(SESSION_SECRET, "maxcore-<gen|admin>")[:40 hex chars]
```

This is used **only** in local mode and only when no explicit MaxCore key is
set. In remote mode with no key, the keys stay empty (callers fail explicitly).
Consequently `SESSION_SECRET` must be present for the derived-key path to work.

### PDIM / storage (now local)

The Python storage client (`artifacts/ai-training-server/storage_client.py`)
reads:

| Variable | Purpose |
|---|---|
| `STORAGE_HTTP_URL` | PDIM storage HTTP-exec endpoint. Now **local**: `http://127.0.0.1:5556/api/redis/instances/local/exec` (POST `{"cmd": …, "args": […]}`). |
| `STORAGE_BEARER_TOKEN` | Bearer token for that endpoint. |
| `STORAGE_INSTANCE` | Logical storage instance name (default `max-booster-training`). |

(The nested `.replit` `[userenv.shared]` sets these to the local PDIM server for
standalone runs; under Max Booster they come from the app environment /
`server/config/index.ts` `storageHttpUrl` / `storageBearerToken`.)

### Control callbacks

`artifacts/ai-training-server/control/client.py` reads:

| Variable | Default | Purpose |
|---|---|---|
| `MAXBOOSTER_URL` | `https://maxbooster.replit.app` | Control-plane endpoint MaxCore calls back to. Also referenced in `control/orchestration.yaml`. |

---

## 4. Auth model

**Only `Authorization: Bearer <key>` is used to reach MaxCore in Max Booster.**

Why: the Python `verify_api_key` checks credentials in the order
`X-Api-Key → X-Admin-Key → Authorization: Bearer`, and the **generation key does
not authenticate under `X-Api-Key`/`X-Admin-Key`** — supplying it via those
header schemes returns `401 "Invalid or inactive API key"`, even alongside a
valid Bearer token. Max Booster's client therefore sends **Bearer only** for
generation/inference calls (`server/services/maxcoreClient.ts` `authHeaders()`;
`server/services/maxcoreConnector.ts` `Authorization: Bearer <generationKey>`).

Notes:

- **Administrative** endpoints are `X-Admin-Key`-scoped: the admin connector
  sends `X-Admin-Key: <adminKey>` deliberately (`maxcoreConnector.ts`), and the
  Python `verify_admin` accepts `X-Admin-Key` or `Authorization: Bearer`.
- The env-bypass keys (`ADMIN_KEY` / `AI_SERVER_KEY` / `AI_TRAINING_KEY_PROD`)
  authenticate under any of the accepted schemes because they short-circuit
  before the DB lookup — but the *generation* key delivered to callers is only
  valid as a Bearer token, hence the Bearer-only rule.

---

## 5. Running the test suites

Run everything from `external/maxcore/artifacts/ai-training-server`.

### 5.1 Offline suites (`ai_model`)

These run in-process and need no live server:

```bash
cd external/maxcore/artifacts/ai-training-server
python3 -m pytest ai_model -q \
  --ignore=ai_model/maxcore/tests/endpoint_load_test.py
```

`ai_model/maxcore/tests/endpoint_load_test.py` **must be ignored**: it calls
`sys.exit(2)` at import time when `ADMIN_KEY` / `AI_TRAINING_KEY_PROD` are not in
the environment, which aborts pytest collection. It is a live HTTP load harness,
not an offline unit test.

### 5.2 Live-endpoint suites (`tests/`)

These hit the running Python model server. Start MaxCore first (via the Max
Booster workflow or standalone, §7), then:

```bash
cd external/maxcore/artifacts/ai-training-server
MAXCORE_TEST_API_KEY="$MAXCORE_ADMIN_KEY" python3 -m pytest tests/ -q
```

- Default target is `http://127.0.0.1:9878`; override with **`MAXCORE_TEST_BASE`**.
- Some suites also honour `MAXCORE_TEST_ADMIN_KEY` (falls back to
  `MAXCORE_TEST_API_KEY`). A few (`test_all_endpoints.py`,
  `test_content_endpoints.py`) require `MAXCORE_TEST_API_KEY` to be set.
- Suites that need a live server auto-skip when it is unreachable.

**Heavy load suites are excluded by default** — do not run them in routine CI:

- `tests/test_smoke_load.py`
- `tests/test_w6_90m.py` (a standalone 90M-parameter proof; needs both the
  Python server on 9878 and the proxy on 8080 up)

To exclude them explicitly:

```bash
python3 -m pytest tests/ -q \
  --ignore=tests/test_smoke_load.py --ignore=tests/test_w6_90m.py
```

---

## 6. Known issues (currently failing / environment-limited)

These are known to fail specifically on this **CPU-only** workspace:

1. **Pocket-accelerator cache-repeat tests are not bit-identical.**
   In `ai_model/maxcore/tests/test_maxcore.py`, tests asserting that a repeat
   call is served from the pocket cache bit-for-bit
   (e.g. `test_digital_gpu_gemm_served_from_pocket_on_repeat`, which asserts
   `np.allclose(o2, o1, atol=0.0)`, and the repeat/hit tests around it) fail
   because the cached output is not reproduced exactly.

2. **Hi-res diffusion frame exceeds the 15 s budget on CPU-only.**
   `tests/test_diffusion_frame_resolution.py::test_hi_res_request_stays_fast`
   asserts `elapsed < 15` seconds. Native-res is designed for ~3 s, but on this
   CPU-only box the hi-res path exceeds the 15 s ceiling.

3. **One BPM-tolerance test fails.**
   In `tests/test_audio_bpm_key_match.py`, one assertion that the applied BPM
   matches the requested BPM within tolerance (post rubberband pitch/tempo
   shift) fails.

---

## 7. Standalone vs supervised operation

### Supervised (inside Max Booster — the default)

- `MAXCORE_LOCAL` unset/non-`0` ⇒ `maxcoreLocal.enabled = true`.
- Max Booster's `maxcoreLocalSupervisor.ts` spawns
  `artifacts/api-server` (`tsx src/index.ts`) on `MAXCORE_LOCAL_PORT` (8090),
  passing `MODEL_API_PORT` (9878), single-worker (`NODE_CLUSTER_WORKERS=1`),
  `SESSION_SECRET`, the derived/explicit keys, and the schema-scoped DB URL.
- The Node layer owns the Python service lifecycle; readiness is
  `GET /api/health` → `status:"healthy"`.
- Max Booster reaches it over loopback with `Authorization: Bearer` (generation)
  or `X-Admin-Key` (admin).
- Setting `MAXCORE_LOCAL=0` disables the supervisor and points Max Booster at a
  remote MaxCore via `MAXCORE_URL` / `AI_SERVER_URL` (keys must then be provided
  explicitly).

### Standalone (running the imported repo on its own)

The imported repo is a full Replit project (`external/maxcore/.replit`). Its own
"Start application" workflow runs the api-server (`PORT=8080 MODEL_API_PORT=9878
pnpm --filter @workspace/api-server run dev`) plus the ai-dashboard, after
`uv sync --no-dev` for Python deps. In standalone mode the credentials/storage
come from the nested `.replit` `[userenv.shared]` (`ADMIN_KEY`,
`AI_TRAINING_KEY_PROD`, `STORAGE_HTTP_URL`, `STORAGE_BEARER_TOKEN`, …) rather than
from Max Booster's config. Alternatively `run_maxcore.py` supervises
`maxcore_server.py` directly as an "indestructible" restart loop. Standalone mode
is useful for running the live-endpoint test suites in isolation; it is **not**
how MaxCore runs in production under Max Booster.
