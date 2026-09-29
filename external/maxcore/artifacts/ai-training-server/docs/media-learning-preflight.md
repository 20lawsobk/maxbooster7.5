# Live media learning admission

This is a read-only, admin-authorized capability and corpus preflight, **not a
media training endpoint**. Neither a valid manifest nor existing checkpoint files
establish learned generation. No jobs run, weights load, checkpoints change,
network media downloads occur, paid APIs run, or CPU training fallback occurs.

## API

The server's existing `verify_admin` dependency protects both routes:

- `GET /api/training/media/{modality}/preflight`: report current prerequisites.
- `POST /api/training/media/{modality}/preflight`: same report plus validation of
  the JSON manifest supplied directly as the request body.

Only `audio` and `video` are supported. An authorized request for another modality
returns 422. Supported requests return **409** with the full blocked report,
including `blockers`, `implementation_evidence`, `checkpoints`, and `corpus`.
Invalid corpus data is reported as a blocker, not a successful training response.
HTTP body validation may return 422 for a non-object/missing POST body.

Configure `MAXCORE_MEDIA_LEARNING_CORPUS_ROOT` to an operator-controlled local
directory for POST validation. The HTTP caller cannot choose this root. Asset
and evidence paths must resolve inside it. Keep this directory separate from
serving weights and avoid concurrent mutation while checking a corpus.

## Observed missing prerequisites

- Audio serving synthesis in `ai_model/audio/digital_gpu_synth.py` is DSP.
  A learned audio generator, paired media objective, candidate trainer, and
  held-out audio quality evaluation are not wired.
- Video has `MusicVAE`, `TemporalDiT`, and `AwarenessConditioner`, but no
  rights-bound live-media training loop or independent media evaluation is
  wired. The existing text trainer operates on token sequences, not media.
- The diffusion loader retains random initialization on missing checkpoints,
  loads non-strictly, and suppresses load errors. This is not training evidence.
  At implementation inspection, `uploads/diffusion/vae.pt`, `dit.pt`, and
  `conditioner.pt` were absent. The report checks current file presence, not
  checkpoint contents or correctness; presence alone cannot unblock admission.
- The video VAE uses standard Torch convolution/normalization; inference helpers
  use NumPy and no-gradient conversions. Exclusive digital-backend support for
  the complete forward/backward/optimizer path is not verified. Do not replace
  that requirement with CPU execution.
- Before training can be admitted, implement a reviewed media decoder and
  preprocessing contract, actual exclusive-backend training, isolated candidate
  serialization, strict architecture-compatible checkpoint validation with
  training provenance, and independently held-out quality/promotion gates.
  A preflight report must never authorize overwriting serving checkpoints.

These are inspected implementation limitations, not claims that neural video
components do not exist. The current guard intentionally always blocks.

## Exact manifest schema (version 1)

Top-level object: `schema_version: 1`, `items: [...]`. Require 2–256 items,
including both `train` and `holdout`. Each item has:

| Field | Required value |
| --- | --- |
| `id` | Unique nonempty string |
| `modality` | Exactly the requested `audio` or `video` |
| `source_id` | Nonempty source identity; one source cannot cross splits |
| `split` | `train` or `holdout` |
| `path` | Relative local media asset path inside configured root |
| `sha256` | Lowercase SHA-256 hex of the exact media bytes |
| `awareness` | Nonempty observation/context text, at most 16,384 characters |
| `observed_at` | ISO-8601 timestamp with timezone, not in the future |
| `rights` | Object described below |

Each `rights` object requires:

| Field | Required value |
| --- | --- |
| `training_allowed` | JSON boolean `true` (not a string or integer) |
| `rights_holder` | Nonempty rights-holder identity |
| `attested_by` | Nonempty accountable operator identity |
| `license` | Nonempty identification/description of the training grant |
| `attested_at` | ISO-8601 timestamp with timezone, not in the future |
| `evidence_path` | Relative local path to source-specific grant evidence |
| `evidence_sha256` | Lowercase SHA-256 hex of exact evidence bytes |
| `expires_at` | Optional ISO-8601 timestamp with timezone; if supplied, must be future |

Evidence must be nonempty and at most 1 MiB. Each media asset must be nonempty
and at most 64 MiB; total assets at most 256 MiB. Duplicate media hashes are
rejected, even under different IDs/sources. Operators must assign common source
identities to related clips to prevent source leakage; automatic semantic
near-duplicate detection is not implemented.
Awareness observations/prompts also cannot cross train/holdout after Unicode
NFKC normalization, case folding, and whitespace collapsing, even when media
hashes and source IDs differ. This blocks normalized exact prompt overlap, not
semantic paraphrases; operators remain responsible for separating related
observations.

All required fields above are validated. Additional metadata fields are retained
in the manifest fingerprint but do not grant capabilities. URL paths are not
downloaded. Public accessibility, link metadata, or a license name alone is not
a training-rights grant: provide source-specific evidence covering the media,
performers/recordings as applicable, and the intended training use.

Validation labels rights `operator_attested`, not legally verified. It binds the
attestation/evidence and asset hashes into `manifest_sha256`; it does not verify
the legal authenticity of the grant, media codecs, model quality, or freshness
beyond rejecting future observations. `media_decode_validated` remains false.
Test fixture bytes are never training data.