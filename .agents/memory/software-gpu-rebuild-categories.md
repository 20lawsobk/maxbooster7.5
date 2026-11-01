---
name: Software-GPU "rebuild it" categories — what's honestly buildable
description: When asked to rebuild ZLUDA/vGPU-MIG/from-scratch-silicon-class GPU tech on a CPU-only host, which categories are real vs. impossible here, plus two scheduler-testing pitfalls hit while proving it.
---

## The four categories, and the real ceiling of each on a CPU-only host
1. **CUDA-on-CPU kernel translation** (CuPBoP/BarraCUDA-class) — real, buildable,
   already done in `tools/native_simt/` (this repo, not MaxCore's own copy of
   the same category under `external/maxcore/.../gpu/native/`).
2. **From-scratch SIMT silicon design** (Vortex/Ventus-class) — real,
   buildable as actual synthesizable-style Verilog, verified with a real RTL
   simulator (`iverilog`/`verilator`, installable via installSystemDependencies
   — nixpkgs attribute is `iverilog`/`verilator`, NOT `verilog`). Lives in
   `hardware/digital_gpu_core/`. Simulation proves the digital LOGIC (true
   SIMT lockstep + real per-lane predicated divergence) is correct; there is
   no FPGA/ASIC in this container, so it is never synthesized onto physical
   silicon here and simulated cycles are not a clock-rate performance claim.
3. **Software GPU virtualization** (time-sliced vGPU-class, NOT MIG) — real,
   buildable as a Deficit Round Robin scheduler over shared compute. Lives in
   `tools/vgpu_scheduler/`. MIG-style hardware spatial partitioning is NOT
   reproducible without a real physical die to fuse regions of.
4. **Cross-vendor hardware translation** (ZLUDA-class) — NOT achievable
   without a second real GPU vendor's hardware/driver to translate to. The
   only honest, non-theatrical analog: a real CUDA Runtime API-compatible
   interception/redirection SHIM (same architecture pattern ZLUDA/CuPBoP
   use) dispatching to our own CPU engine — built in `tools/cuda_shim/`. This
   proves the API-compatibility-shim technique works; it does not prove
   cross-vendor hardware translation, because no second hardware exists here.

**Why this split matters:** MaxCore's own internal memory
(`external/maxcore/.agents/memory/software-gpu-paths.md`, `silicon-performance-model.md`,
`pocket-gpu-pool.md`) independently documents the identical honesty boundary —
numpy/torch-on-CPU may MODEL GPU semantics but must never claim real silicon
throughput. Treat any "digital GPU" claim in this family of repos against
that same four-category test before agreeing anything is missing or already built.

## Scheduler-testing pitfalls (cost >1 attempt to find)
- **DRR/WFQ fairness must be measured under SUSTAINED contention, not
  run-to-completion.** Give tenants very different total backlog sizes and a
  low-weight tenant with a huge backlog will legitimately run ALONE for a
  long tail once higher-weight tenants with small backlogs drain early —
  that tail makes total measured time share look totally unfair even though
  the scheduler is correct. To validate the weight ⇔ service-share invariant,
  give every tenant a backlog large enough that none drains within the
  measurement window, then measure shares only over that still-all-backlogged
  window. Keep a SEPARATE small/uneven-backlog scenario to prove the
  unrelated, also-real property that nothing is starved forever.
- **Lazy-generate job payloads inside the closure, not at submit time.**
  Building a large payload (e.g. numpy arrays) once per queued job and
  holding hundreds of them in a backlog before they run is a fast way to
  OOM-kill the process; generate the payload inside the job's own callable so
  memory is only live while that one job executes.
