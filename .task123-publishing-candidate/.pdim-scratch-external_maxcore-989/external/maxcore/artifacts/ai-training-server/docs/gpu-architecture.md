# GPU subsystem architecture (canonical decision)

Commits `39d874d5` / `0e726ebb` (2026-05-03) mandated a single "DigitalGPU"
compute abstraction, but several independently-evolved "GPU"-branded
subsystems accumulated afterward without ever routing through one another.
This document records the reconciliation: what is canonical for each
workload, what was dead code, and what was removed.

## Canonical paths, by workload

| Workload | Canonical subsystem | Notes |
|---|---|---|
| Model inference / training (`server.py`, the creative/script/visual-spec/optimization agents) | `ai_model/gpu/hyper_core.py` (`HyperGPU`) + `hyper_backend.py` (`HyperGPUBackend`) | The only engine actually warmed at boot (`_init_ai_model`) and invoked for real compute. Status: `GET /gpu/hyper/status`. |
| Pocket-accelerator GEMM caching for audio STFT/iSTFT synthesis (`ai_model/audio/digital_gpu_synth.py`) | `ai_model/maxcore/api.py` (`DigitalGPU`) — the MaxCore IR/compiler/runtime stack (`ai_model/maxcore/{ir,compiler,runtime,backend}`) | A distinct caching/dedup layer (pocket-dimension namespaces), not a competing model-compute engine. This is a leaf numeric workload that only needs cached GEMMs, not the full agent/model orchestration HyperGPU provides. |
| RTA-1 render fabric (`ai_model/rta/` — the IRC/VRC/ARC path tracer, colour-grade, and spectral-restoration node graph) | `ai_model/gpu/digital_gpu.py` (`DigitalGPU`) — the standalone ISA/VRAM/SIMDCore emulator, instantiated directly in `ai_model/rta/fabric/compute.py::RTACompute` | A genuinely separate, actively-used compute path (NOT dead code — distinct from both HyperGPU and the MaxCore `DigitalGPU` facade above, despite sharing a class name with the latter). RTA was designed against this specific ISA emulator's deterministic instruction semantics and does not route through HyperGPU or the MaxCore facade. Documented here as an intentional exception rather than unified, to avoid destabilizing a working, self-contained render fabric; see follow-up task for adding contract tests around it. |
| Max Booster's own video diffusion pipeline (`api_server_v4.py`, port 8008, proxied by `server/diffusion-gateway`) | `server/services/digitalgpu.py` | Separate Node/Python project (Max Booster app, not MaxCore). Actively imported by `api_server_v4.py` and exercised end-to-end. |

Note: three distinct classes are named `DigitalGPU` across the codebase —
`ai_model/gpu/digital_gpu.py` (ISA/VRAM emulator, used by RTA),
`ai_model/maxcore/api.py` (MaxCore IR/runtime facade, used by audio synth),
and `server/services/digitalgpu.py` (Max Booster's video-pipeline backend).
They are unrelated implementations that happen to share a name; do not
assume interchangeability when reading call sites.

## Removed as dead code

- `ai_model/gpu/digital_gpu.py`'s `DigitalGPU` class (a standalone ISA/VRAM/
  SIMDCore emulator — unrelated to `ai_model/maxcore/api.py`'s class of the
  same name) was instantiated in `server.py::_init_ai_model` as
  `_digital_gpu_backend` but never called for compute anywhere in the file.
  Worse, because it was never `None`, `/gpu/status`'s lazy-init branch for the
  *real* `torch_backend.DigitalGPUBackend` never ran, and calling `.status()`
  on the ISA emulator (which has no such method) made the endpoint always
  report `available: false` even though the platform's actual GPU backend
  (HyperGPU) was healthy. The dead instantiation was removed; `/gpu/status`
  and `/gpu/hyper/status` now both correctly initialize and label which
  backend is primary vs. secondary.
- `ai_model/gpu/execution_graph.py`, `digital_library.py`, `multi_backend.py`,
  `multi_stream.py`, `ai_model/api/app.py`, `ai_model/serve.py`, and
  `ai_model/model/multi_head_model.py` formed a self-contained alternate
  FastAPI entrypoint (`serve.py` → `ai_model.api.app:app`) that has never been
  started by any workflow, script, or `.replit` config — the live entrypoint
  is `server.py`, spawned by `artifacts/api-server/src/python-server.ts`.
  Deleted along with their now-orphaned test (`gpu/tests/test_execution_stack.py`).
- The top-level `digital gpu/` directory (space in the name) was an
  unreferenced, stale duplicate of `server/services/digitalgpu.py` and
  `video_diffusion/*` — leftover scaffolding from an abandoned consolidation
  attempt. Deleted.

## Status endpoints

- `GET /gpu/hyper/status` — primary compute engine (HyperGPU).
- `GET /gpu/status` — secondary `torch_backend.DigitalGPUBackend` SIMD-lane
  accounting shim, kept for backward compatibility; response now includes
  `primary_compute_backend: "hyper_gpu"` so callers don't mistake it for the
  main path.
- `GET /gpu/capabilities` — reports both, each tagged with its `role`
  (`primary` / `secondary`).
