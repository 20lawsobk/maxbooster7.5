# MaxCore trained-checkpoint readiness

`model_loaded` is a release claim, not a process-health flag. It is `true` only
when the serving process has loaded a non-smoke checkpoint that passed current
signed-review eligibility and the live generation-capability check. Awareness
availability, candidate discovery, model imports, media renderers, and a
generation adapter by themselves do not satisfy this condition.

## Separate runtime states

- `generation_model_loaded` means a generation adapter is available in memory.
- `generation_ready` means a supported text path can run with current awareness
  and required runtime dependencies.
- `model_loaded` / `trained_checkpoint_loaded` means a signed-reviewed trained
  checkpoint is loaded and passed its current evidence and operational checks.
- Live awareness remains a separate capability. It can support generation
  without making `model_loaded` true.

The trained-checkpoint status is derived from release-loader evidence; clients
must not set or infer it from liveness, a successful import, or an awareness
snapshot.

## Requirements before a candidate can be served as trained

1. The training run is non-smoke and preserves current source rights,
   provenance, privacy screening, deduplication, measured optimizer updates,
   finite metrics, and checkpoint/lineage fingerprints.
2. Internal owner/simulation candidates carry their owner-rights receipts and
   their separate frozen holdout. Public visibility or awareness-source
   approval alone is not a training grant.
3. The evaluation is bound to the exact checkpoint and frozen protocol, and
   contains a real output for every case without errors.
4. `MAXCORE_CANDIDATE_TRUST` points to an operator-installed trust policy. A
   reviewer with role `independent-quality-reviewer` signs the exact review
   JSON using the trust policy's public key. The review must bind the checkpoint,
   corpus manifest, report, evaluation, and protocol hashes; include substantive
   quality, safety, and data-rights rationales; and meet the configured
   per-case threshold.
5. The exact selected candidate is revalidated, loaded under the supported
   exclusive backend policy, and tested through the current text capability
   path. Any missing, changed, stale, unsigned, or unusable evidence blocks
   trained readiness.
6. The registry, selected pointer, checkpoint, and their evidence remain in the
   configured durable model-state location. After deployment, verify status and
   generated text after two clean process restarts.

## Operator trust boundary

The candidate registry documents the JSON trust-policy format in
`ai_model/training/candidate_registry.py`. The reviewer private key must remain
outside this repository and the training server. Install only the reviewer's
public key and its independently verified SHA-256 fingerprint in the trust
policy. Never create a self-signed approval using the model owner's key, and
never weaken the registry to convert an unsigned candidate into a trained
release.

After an authorized reviewer has created the bound review and detached
signature, submit the five evidence paths with
`python -m ai_model.training.auto_selection --run ... --evaluation ...
--protocol ... --review ... --signature ...`. The CLI rechecks eligibility
before enqueueing; the serving loop revalidates the selected pointer and loads
the exact checkpoint. A queued or selected candidate is not yet proof of
`model_loaded: true`; only the serving status after successful load is.

## Current release limitation

The repository does not include an independent reviewer trust policy,
reviewer's public-key fingerprint, signed acceptance, or an eligible
production-quality selected checkpoint. Therefore this implementation must
continue to report `model_loaded: false` until those external, evidence-bound
inputs are installed and the complete serving/restart checks pass. The tracked
`model.corrupt` artifact is not a substitute for a verified trained checkpoint.
