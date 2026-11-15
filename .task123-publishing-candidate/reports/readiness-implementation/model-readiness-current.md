# MaxCore model readiness — current evidence

Date: 2026-09-23

## Decision

**PASS for actual numerical serving inference; held-out learned quality remains
unproved.** A bounded CPU probe strictly loaded the original Git-imported
candidate into the actual `HyperCreativeTransformerLM` serving class and
completed two deterministic real forwards with finite `[1, 2, 1000]` logits.
Only after that result, the validated bytes were atomically copied to the active
`external/maxcore/artifacts/ai-training-server/ai_model/weights/model.pt` path.
The original `model.corrupt` candidate remains present and unchanged.

This follows the local authority in
`.agents/memory/endpoint-audit-contract-boundary.md` and
`.agents/memory/maxcore-only-fail-explicit.md`: learned capability requires a
valid checkpoint and held-out evidence, and absence must fail explicitly rather
than fall back to random or local output. This report establishes numerical
inference only; it does not claim held-out quality or trained capability quality.

## Active path and available candidates

- `server.py::_init_ai_model` resolves only the fixed local path
  `ai_model/weights/model.pt`. There is no serving-path environment override.
- The active initialization now uses `torch.load(..., weights_only=True)` through
  `load_checkpoint_archive`, then requires a non-empty string-keyed model-state
  mapping and an exact key/shape match through `load_complete_checkpoint`.
- The active `model.pt` is now present as a byte-identical copy of the validated
  candidate. If it becomes absent, initialization cannot set `_model_ready`; the
  status source is `unavailable`, not `random_init`, and terminal initialization
  errors are exposed as failed/503 rather than remaining “initializing” forever.
- The configured storage checkpoint path does not restore weight bytes:
  `_load_checkpoint_from_storage` reads history/metadata and explicitly says
  weights live on disk.
- Configured local backup names include `model.pre_bpe_backup.pt`; none was
  available. The restored `model.pt` came only from the validated local
  `model.corrupt` bytes and not from training, a download, or a random fallback.
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

The latest explicitly authorized serving probe raised the possible child ceiling
to the smaller of 768 MiB and current `MemAvailable` minus a mandatory 384-MiB
host reserve, with one CPU thread and a 120-second wall limit. The single
pre-spawn measurement found:

- host `MemAvailable`: 679,567,360 bytes (648.09 MiB);
- cgroup limit/current/headroom: 8,589,934,592 / 6,401,261,568 /
  2,188,673,024 bytes;
- maximum permitted child RSS after the host reserve: 276,914,176 bytes
  (264.09 MiB).

No child was spawned. The permitted ceiling was already below both the prior
metadata/shape probe peak (306,432 kB) and the prior forward attempt's pre-result
RSS (395,592 kB). Starting Torch/model construction under that ceiling could not
reach the requested forward and would have violated the concrete reserve rule.
Per the instruction to stop on legitimate inability rather than iterate safety
gates, this capacity decision was not retried. No checkpoint file was created,
copied, renamed, or modified.

After the editor language server was independently restarted, one new bounded
probe ran under the authorized contract. Its pre-spawn measurements were
5,312,672 kB host `MemAvailable` and 7,291,912,192 bytes cgroup headroom. The
child was limited to 768 MiB RSS, one CPU thread, a 120-second wall limit, a
384-MiB host reserve, and a 384-MiB cgroup reserve. It used a sanitized
environment and private scratch directory, loaded the candidate read-only with
`weights_only=True`, `map_location="cpu"`, and `mmap=True`, and imported the
serving class directly without starting the application.

The child exited zero in 10.265748 seconds with 466,004 kB peak measured RSS.
Strict loading covered all 71 serving state keys with checkpoint config dim 512,
8 layers, 8 heads, max length 1024, 443 tokenizer entries, and the server's
effective vocabulary size of 1000. The serving `head.weight` remained tied to
`token_emb.weight` after strict load. Two forwards of the same `[BOS, EOS]`
tensor both returned finite, non-empty `[1, 2, 1000]` logits and identical greedy
IDs `[[376, 2]]`. The full logits were exactly equal across the repeated eval
forwards. This is real numerical serving inference, not a mock, schema check, or
structural-only inspection.

The candidate SHA-256 remained
`80c19ffc3ec155808f0a2a3ce5b75f09e203d336ebf3e076144dd6e970d3b419`.
After the successful probe, a same-directory temporary copy was fully written,
flushed, hash-verified, atomically replaced into `model.pt`, and the directory
was synced. The active copy is 109,368,185 bytes, has that same SHA-256, and has
a distinct inode from the preserved original candidate.

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

## Six-gate disposition

1. **PASS — authentic local identity/provenance.** Explicit release authority
   accepts the original local Git import for numerical-inference serving. The
   Git blob and SHA-256 are recorded above.
2. **PASS — safe deserialization.** The candidate loads tensor-only on CPU with
   `weights_only=True`; the successful probe additionally used read-only mmap.
3. **PASS — tokenizer/config completeness.** The active absent-merges rule,
   special tokens, 443-entry vocabulary, and model config all validate.
4. **PASS — strict serving compatibility.** All 71 keys and shapes match the
   actual serving configuration, including the strictly loaded tied head.
5. **PASS — actual bounded serving forward.** Finite, non-empty logits and
   deterministic repeated greedy output were measured within the authorized
   wall, RSS, host-reserve, and cgroup-reserve limits.
6. **NOT CLAIMED — held-out learned quality.** No held-out quality/calibration
   evaluation was run. The checkpoint contains no observed training
   epoch/step/loss metadata. Numerical inference and active checkpoint recovery
   must not be represented as evidence of trained quality.

The five model-serving gates are satisfied and the validated checkpoint is at
the exact active path. The separate held-out-quality gate remains explicitly
unproved.

## Shipping boundary

The active `model.pt` is intentionally gitignored, so its workspace presence
alone is not treated as publish evidence. The immutable release source is the
already tracked `model.corrupt` Git LFS object: pointer Git blob
`6c42ee77db0ed344e62b4cf86ad1353c79e818a0`, whose LFS OID is the checkpoint
SHA-256 below. The release `model.release.json` validates that pointer identity
and binds its hydrated source plus the active destination to
109,368,185 bytes and SHA-256
`80c19ffc3ec155808f0a2a3ce5b75f09e203d336ebf3e076144dd6e970d3b419`,
while explicitly limiting the claim to numerical inference and marking quality
as not evaluated.

At the start of every `DEPLOY_PACK=1` build, before expensive compilation or
packing, `validateModelRelease` verifies the immutable source and atomically
materializes `model.pt` if the ignored active copy is absent. The
`external/maxcore` capsule pack then independently checks the required active
member's path, byte count, and SHA-256. A successful
`external_maxcore.manifest.json` records that required member alongside the
capsule hash. Therefore the release path is:

`tracked model.corrupt` → manifest-verified atomic `model.pt` copy →
required member of `external_maxcore.pdim` → background capsule restore to the
exact active server path.

The disposable production simulator excludes all `.pt` files and the immutable
source from its broad tree copy, then explicitly admits only the
manifest-bound source after size/hash verification. This prevents unrelated
generated checkpoints from entering the simulation snapshot.

Focused manifest and real capsule round-trip tests pass (6 tests). The current
source manifest also validates against the real 109,368,185-byte artifact.
No full deploy build, publish, capsule regeneration, or cold-boot restore was
run while the migration worker was active, so this source-level shipping proof
is not represented as observed cold-boot evidence.
