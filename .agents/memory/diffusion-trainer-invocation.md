---
name: Diffusion trainer invocation and memory ceiling
description: Two independent, load-bearing problems with server/services/diffusion (the in-house NumPy video-diffusion engine) discovered while trying to actually run training.
---

## Invocation bug (fixed)
`server/services/diffusionVideoService.ts` spawned `synthesizer.py` by its file path directly. `synthesizer.py` uses package-relative imports (`from .scheduler import ...`), which only work when Python treats it as a submodule of the `diffusion` package. Invoked as a bare script it has no package context and every relative import throws `ImportError: attempted relative import with no known parent package` — training/generation could never start at all.

**Fix:** spawn with `["-m", "diffusion.synthesizer", ...]` and `cwd` set to the diffusion package's parent directory (`__dirname` in `diffusionVideoService.ts`), not the script's own directory.

**How to apply:** any future direct `child_process.spawn` of a `.py` file inside a package that uses relative imports needs the same `-m <pkg>.<module>` + correct `cwd` treatment — a script path alone silently breaks relative imports with no hint from the error message that invocation style is the cause.

## Memory ceiling (unresolved, needs a bigger box)
Once invocation was fixed, training starts correctly but gets SIGKILL'd (exit 137, OOM) a few dozen seconds in, every time, reproducible directly via `python -m diffusion.synthesizer --train-only --tier quick --epochs 1` run standalone. The dev container sits at ~6GB/7.8GB used at rest (app + MaxCore subsystem), leaving well under 2GB free — not enough for the training dataset pipeline (600+ scene prompts, PIL-rendered templates all built up-front).

**Why:** `server/services/diffusion/start_api.sh` already documents the intended runtime as a Reserved VM (16 vCPU/64GB) — the training/full-model path was designed assuming much more RAM than the standard dev container provides.

**How to apply:** don't attempt a real training run in the standard dev workflow container; it will OOM regardless of tier/epoch count chosen. Needs either a Reserved VM environment, a memory-reduced dataset-loading path (not currently exposed via CLI — `--samples` is not a real flag despite `trainDiffusionModel`'s `nSamples` option existing in the TS wrapper), or running training with the main dev workflow stopped to free RAM headroom.

## Also note
`trainDiffusionModel`'s `nSamples` option in `diffusionVideoService.ts` passes `--samples` to `synthesizer.py`, which does not accept that flag (argparse rejects it, exit code 2) — the option is dead/non-functional; only `tier` and `nEpochs` actually reach the script.
