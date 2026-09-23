# MaxCore model readiness — current evidence

Date: 2026-09-23

## Decision

**BLOCKED — no serving checkpoint is present and no real model inference was
proved.** The active loader requires
`external/maxcore/artifacts/ai-training-server/ai_model/weights/model.pt`; that
file is absent. The only checkpoint-shaped artifact is the already-quarantined
`model.corrupt`. It was not restored, renamed, overwritten, trained, downloaded,
or substituted. Source checks and archive inspection are not real inference.

This follows the local authority in
`.agents/memory/endpoint-audit-contract-boundary.md` and
`.agents/memory/maxcore-only-fail-explicit.md`: learned capability requires a
valid trained checkpoint and held-out evidence, and absence must fail explicitly
rather than fall back to random or local output.

## Active path and available candidates

- `server.py::_init_ai_model` resolves only the fixed local path
  `ai_model/weights/model.pt`. There is no serving-path environment override.
- The active initialization now uses `torch.load(..., weights_only=True)` through
  `load_checkpoint_archive`, then requires a non-empty string-keyed model-state
  mapping and an exact key/shape match through `load_complete_checkpoint`.
- If the file is absent, initialization cannot set `_model_ready`. The status
  source is now `unavailable`, not `random_init`, and terminal initialization
  errors are exposed as failed/503 rather than remaining “initializing” forever.
- The configured storage checkpoint path does not restore weight bytes:
  `_load_checkpoint_from_storage` reads history/metadata and explicitly says
  weights live on disk.
- Configured local backup names include `model.pre_bpe_backup.pt`; no such file,
  `model.pt`, `.pt`, `.pth`, `.ckpt`, `.safetensors`, or `.npz` candidate exists
  anywhere under the current `external/maxcore` tree.
- `external_maxcore.pdim` contains `model.corrupt` at the same quarantined path
  and contains no serving `model.pt` or backup candidate. Restoring that capsule
  would therefore not supply active weights.

## Quarantined artifact provenance and bounded inspection

Artifact:

- Path: `external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt`
- Size: 109,368,185 bytes
- SHA-256: `80c19ffc3ec155808f0a2a3ce5b75f09e203d336ebf3e076144dd6e970d3b419`
- Git blob: `6c42ee77db0ed344e62b4cf86ad1353c79e818a0`
- Filesystem artifact mtime: `2026-08-14T08:46:07Z`
- Current-tree import commit: `b5d585160a8b814ff053745b9c195d45ae3758b5`
  at `2026-09-02T12:43:51Z`; it was added under the name `model.corrupt`, not
  renamed by this investigation.

No historical reason sidecar or alert record accompanies this artifact, so the
original quarantine reason is **unknown**. The prior watchdog could have produced
the same basename, but repository history does not prove that it did. Claiming a
specific corruption exception would be fabricated provenance.

Credential-free standard-library inspection ran in a sanitized environment and
did not execute the pickle:

- End-of-central-directory location exactly matches the 109,368,185-byte file.
- The central directory reports 76 entries and `zipfile.testzip()` reports no
  bad CRC. Thus the available evidence does **not** prove truncation.
- `model/data.pkl` is 23,852 bytes. `pickletools` inspection (no unpickle)
  identifies a packaged `model_state_dict`, 70 `_orig_mod.*` tensor names,
  and only the expected `collections.OrderedDict`,
  `torch._utils._rebuild_tensor_v2`, and `torch.FloatStorage` globals.
- Generic `unzip -t` reports invalid one-byte extra-field blocks on aligned
  tensor entries, while Python's ZIP parser validates all CRCs. This discrepancy
  is not sufficient to call the PyTorch archive corrupt or trustworthy.

The later capacity-gated Torch inspection was feasible and ran once through the
actual safe load:

- Initial `MemAvailable`: 1,167,924 kB.
- Initial cgroup headroom: 3,180,593,152 bytes.
- Child contract: sanitized environment/private scratch, CPU only, one thread,
  process group, 60-second wall limit, 384 MiB RSS kill threshold, and mandatory
  256 MiB host/cgroup reserve.
- Actual safe call: `torch.load(..., map_location="cpu", weights_only=True,
  mmap=True)` against the quarantined file in place (read-only).
- Peak measured child RSS: 226,340 kB. No reserve or wall gate fired.
- Torch deserialization reached the packaged mapping/model-state/config and
  returned safely. The probe then exited explicitly because its tokenizer
  completeness check required `merges`.
- A follow-up non-executing `pickletools` metadata check established that
  `vocab`, `inv_vocab`, `next_id`, and `config` (`dim`, `layers`, `heads`,
  `max_len`) are present, while `merges` is absent. The active loader explicitly
  accepts absent merges as `[]`, so this is not by itself proof of incompatibility.

The corrected compatibility probe used the real runtime rule (`merges` defaults
to `[]`) and imported model classes directly without importing `server.py`:

- Torch: `2.13.0+cpu`; load remained CPU/mmap/weights-only.
- Checkpoint config: dim 512, 8 layers, 8 heads, max length 1024.
- Tokenizer: 443 vocab entries, 443 inverse entries, zero merges. IDs are unique,
  inverse mappings agree, and PAD/BOS/EOS/UNK are present.
- A real `TransformerLM` training architecture and the actual
  `HyperCreativeTransformerLM` serving architecture were each constructed on
  the meta device from checkpoint config. This does not allocate model weights.
- The checkpoint has 71 cleaned tensor keys. Both meta models expect 71 keys.
  For both models: zero missing keys, zero unexpected keys, and zero wrong
  shapes. `exact_architecture_compatible` is true.
- The completed metadata/shape run peaked at 306,432 kB RSS and exited zero
  without crossing host/cgroup reserves.

After exact compatibility passed, one bounded real CPU forward was attempted
with strict state loading and a two-token BOS/EOS tensor. The monitor killed its
process group at the required 384-MiB ceiling: measured RSS reached 395,592 kB
(386.32 MiB) before any result was emitted; host and cgroup reserves remained
above their gates. It was not retried with a relaxed ceiling. Thus no finite
logit or genuine forward-inference proof exists, and the artifact was not
promoted or renamed. Compatibility is structural evidence, not training
provenance, held-out quality, or real inference.

One preliminary launcher named `inspect.py` shadowed Python's standard-library
`inspect` module and failed before Torch imported (14,912 kB peak); it did not
touch or deserialize the checkpoint.

A subsequent evidence-sized serving-forward probe was authorized with a 640-MiB
RSS ceiling, but only when both initial host and cgroup headroom were at least
1,024 MiB, preserving 384-MiB reserves throughout. The pre-spawn gate measured
846,340 kB host `MemAvailable` and 2,678,296,576 bytes cgroup headroom. Because
host headroom was below the mandatory 1,024-MiB threshold, **no child was
spawned**. Per the stop condition, there was no retry. Therefore the actual
`HyperCreativeTransformerLM` two-token forward, finite-logit check, expected
`[1, 2, 1000]` dimensions, and deterministic repeated greedy result remain
unproved.

The safe metadata evidence contains tokenizer `next_id` but no observed
non-secret training epoch/step/loss field among the inspected common names
(`epoch`, `epochs`, `step`, `global_step`, `training_step`, `total_epochs`,
`final_loss`, `loss`, `best_val_loss`). Structural completeness does not prove
that these are trained or qualified weights.

Capsule provenance:

- `external_maxcore.pdim` SHA-256:
  `3ad9f05c3c10eeb701c2387c49f6661a3169fb07139aacd94bd5c1c739e44cb2`
- `external_maxcore.manifest.json` SHA-256:
  `15aa963e3a23a25551e24ae9eb8947f4ceee67b4644f04a687e79d53b1dcfc7e`
- Manifest-declared capsule SHA-256 matches the measured capsule hash.

## Correctness fixes

1. Active serving loads now set `weights_only=True`; arbitrary pickle loading is
   no longer used at this boundary.
2. Archive root/model-state shape is validated before model construction uses it.
3. Watchdog integrity checks use the same safe loader.
4. Quarantine no longer overwrites an existing `model.corrupt`. It uses
   collision-safe hard-link publication and records source name, destination,
   SHA-256, UTC time, and actual exception reason in a JSON sidecar before
   removing the source. A colliding pre-existing provenance sidecar is never
   deleted; the new artifact advances to the next unused suffix.
5. Watchdog quarantines only explicitly invalid/unusable semantic loads
   (`ValueError`, `EOFError`, or safe-loader `UnpicklingError`). Memory, I/O,
   import, runtime, and unknown operational failures report
   `checkpoint_integrity_unverified`, change no file, and are retried. Raw
   state-dict checkpoints accepted by the active loader are also accepted by the
   watchdog.
6. Watchdog messaging no longer claims deletion or random initialization.
7. Model initialization resets `_model_ready` before every reinitialization and
   records a terminal error. Readiness returns explicit
   503, model status reports `failed`, and missing weights report source
   `unavailable`.
8. Source comparison found the serving `HyperCreativeTransformerLM` claimed
   training-model state compatibility but omitted the tied `head.weight` module,
   while the checkpoint metadata contains `_orig_mod.head.weight` and strict
   loading rejects unexpected keys. The serving model now declares the same
   bias-free head and ties it to `token_emb.weight`, matching `TransformerLM`
   without adding a second parameter or changing inference math.

## Focused verification

- `CheckpointTests`: 8 passed. Covers weights-only call arguments, invalid roots,
  exact checkpoint matching, collision-safe quarantine, preservation of an older
  quarantine and colliding sidecar, provenance hash/reason, raw-state parity,
  semantic invalid quarantine, and no mutation on operational verification
  failure, plus retention of the tied training-checkpoint head key in the serving
  architecture.
- Readiness regression: 1 passed, 6 deselected. Covers terminal init failure,
  explicit 503, unavailable source, and absence of the old `random_init` claim.
- `py_compile` passed for both changed model modules and both focused test files.
- `git diff --check` passed.
- The existing 494-test result was not rerun.

Current source SHA-256 values:

- `server.py`: `ea83aef45af149339f9568bb14a030d50d953e11bcff5e2f8b2029a2b661ffa7`
- `ai_model/media_contract.py`:
  `905c1dc164bbfee60658f70a52fd6500cdd23d11fcfc81361679cf315cd08b66`
- `ai_model/gpu/hyper_creative_transformer.py`:
  `365bae7a9f48ff626d12ada91e0aedad24a52d8eebb9848fa0f54d0e64d08576`
- `workers/watchdog.py`:
  `14f8e9e92b7fba0859b2d375d329a799547e2cd334b80d18761a3ca4e8040325`
- `tests/test_media_delivery_contract.py`:
  `4858dc6369eca0bade2451b4a616aa13f01dc84035468e7994ed6ffd0c938804`
- `tests/test_unavailable_inference_contracts.py`:
  `a097f4bc2afe550ea0cf61fc795dece536335cac32370c6612a8821640069d24`

## Remaining release gates

1. Supply a legitimately sourced trained `model.pt` without overwriting the
   quarantine, with artifact identity, training/evaluation provenance, tokenizer
   and configuration provenance, and a release hash.
2. For a legitimately sourced serving candidate, repeat the now-measured
   capacity-safe private-scratch contract: sanitized environment, CPU-only one
   thread, `weights_only=True`, mmap where supported, a 60-second timeout,
   384-MiB measured RSS kill gate, and 256-MiB host/cgroup reserves.
3. Exact training/serving key and shape compatibility plus tokenizer/config
   completeness are now proved for the current quarantine. This does not establish
   where or how the weights were trained.
4. In a larger authorized resource budget, run a minimal actual forward
   inference using the serving model class and checkpoint, prove finite/non-empty
   model output, and record the checkpoint and source hashes. The 384-MiB attempt
   was correctly killed at 395,592 kB RSS before a result; the authorized
   640-MiB attempt did not spawn because host headroom was only 846,340 kB versus
   the required 1,024 MiB. Do not count import, source inspection, ZIP/CRC checks,
   meta-model matching, mocks, or endpoint schema checks as inference.
5. Run capability-specific held-out quality/calibration gates before claiming
   learned production readiness.
