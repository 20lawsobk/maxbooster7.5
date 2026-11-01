# Operator contract: live text candidate learning

This service consumes fresh, validated observations from the existing live
awareness engine. The default `live-awareness` serving mode now runs a background
learning loop and loads registry-selected live candidates. Training never writes
serving weights or claims quality. It trains only on text already collected by
the awareness engine; the training worker does not fetch or scrape sources.
The awareness systems target public HTTP sources only, never traditional
corpora or private inputs. New observations record public access and `private: false`;
license remains `NOASSERTION` and attribution remains explicit. Previously
certified public scanner records with legacy privacy metadata remain readable.

## Admin endpoints

Use the existing MaxCore admin authentication (`X-Admin-Key`, or its supported
admin bearer credential). Ordinary generation/train-scoped keys are insufficient.

* `POST /api/training/candidates/live` with `{"steps": 4}` starts one synchronous,
  isolated run. `steps` is an integer from 1 through 64; extra fields are rejected.
  Callers cannot supply a corpus, holdout, output path or model.
* `GET /api/training/candidates/live` lists retained run IDs and terminal/current
  metadata. Use this after a disconnected POST or server restart.
* `GET /api/training/candidates/live/{run_id}` returns that run's metadata.
  Neither GET exposes source text, holdout prompts or operator file paths.
* `GET /api/training/live/status` reports the automatic loop and serving release.
  It is also available through the imported Node service and the app's admin
  proxy, including while the first model is not ready.

## Automatic learning and serving

`MAXCORE_SERVING_RELEASE=live-awareness` is the server default. It never loads the
old LFS checkpoint. `legacy` and `reviewed-candidate` remain explicit alternatives.
The loop reads the rolling observation ledger, fingerprints source content and
measured values, and uses the existing bounded/certified trainer. Timestamp-only
refreshes do not retrain unchanged content. A private fsynced state file retains
successful content identity and retry cooldown across restarts; a file lock
prevents concurrent automatic owners. The existing training lock also excludes
manual/automatic overlapping training jobs.

Configuration: `MAXCORE_LIVE_LEARNING_INTERVAL_SECONDS=900` (60..86400),
`MAXCORE_LIVE_RELOAD_SECONDS=30` (1..300), `MAXCORE_LIVE_LEARNING_STEPS=4` (1..64),
and `MAXCORE_LIVE_CONTEXT_TOKENS=2048` (128..4096). The context bound is saved in
each candidate and restored on load; overlong requests fail explicitly rather
than losing part of their prompt. Private loop state lives under
`MAXCORE_PRIVATE_STATE_DIR` (also used by the service's other private state).
For cloud hosts requiring an egress proxy, set `MAXCORE_AWARENESS_USE_PROXY=1`
to use the injected `HTTPS_PROXY` for public feed requests. This explicitly
enabled route tunnels the validated public IP, retains original-host TLS
verification, and revalidates redirects. It resolves addresses through the
fixed verified HTTPS DNS endpoint `cloudflare-dns.com` so local DNS need not
egress; every returned address still passes the public-address checks.
Ambient proxy variables alone do not
change the public reader's behavior. Provider-specific search APIs keep their
own configured transports.

Automatic learning retains the historical `candidate_trained_unreviewed` result
label, but public scanner candidates no longer need human review, signatures,
reviewer trust keys or manually supplied evaluation datasets. With
`MAXCORE_AUTO_SELECT=1` (default), the controller discovers completed candidates
under the durable `candidate_runs` directory and selects the freshest eligible
observation set. It verifies parent certification, exact observation provenance,
source access, manifest/checkpoint hashes, privacy screening, finite training
measurements, inference logits and exclusive inference/training backends.
Traditional, mixed, smoke-only, private-source, incomplete and tampered artifacts
cannot use the `certified-public-live-v1` policy. No general quality score is
inferred from these numerical checks.

Selection and adapter loading are atomic. In-flight requests keep their pinned
model identity; rejected updates retain the previous model. Status exposes
`review_required: false`, `active: certified-live-awareness`, and
`candidate_quality: runtime_verified_public_live_not_quality_evaluated`. With no
eligible completed candidate, status is `waiting_for_candidate` and generation
stays unavailable. Deferred jobs never silently change their original model.

Traditional-corpus / `reviewed-candidate` operation keeps its explicit signed
review policy and evaluation checks. `candidate_registry select --live-awareness
--run /absolute/path/to/live-RUN` is available for explicit public-live selection;
the normal automatic flow needs no submission command.

HTTP 201 / `candidate_trained_unreviewed` means measured isolated training and
parent certification succeeded, **not** that generation quality is acceptable.
This historical result label is not a signature requirement for public live models.
Admission failures include `blocked_corpus`, `blocked_training_rights`,
`blocked_awareness`, `blocked_busy`, `blocked_capacity`, and `blocked_bounds`.
Worker outcomes include `failed_training`, `failed_execution_evidence`,
`blocked_timeout` and `failed_interrupted`. Consult JSON `status`; failed runs
never return 201. `running` means the shared lock is still owned by a parent or
inherited worker, not that a checkpoint is eligible for review.

## Live source provenance and privacy

Source-authored peak post text requires approved reuse provenance before corpus
creation, admission, or worker execution. The same check applies when non-peak
mode includes raw Mastodon or Bluesky post text; changing modes cannot bypass it.
The check requires a supported explicit license, an identified author, public
access, a source, and the training purpose. The current scanner records
`NOASSERTION` and `unattributed live observation`, so these posts remain usable
for awareness but receive HTTP 409 / `blocked_training_rights` for training.
Their snapshot IDs, observation IDs, citations, and hashes establish provenance,
not a reuse grant. The optional operator-installed rights manifest below can
authorize exact matching observations; the separate corpus-manifest pathway
continues to support explicitly licensed authored corpora.

The automatic loop durably retains `blocked_training_rights` through cooldown
and restart. It does not describe a refused admission as a running worker. No
source text is fetched by the trainer, and blocked raw posts produce no corpus,
candidate, or serving-weight update.

Existing secret/personal-data screening and holdout-overlap checks still apply.
They remain automatic data-quality safeguards and do not introduce a manual
review or signature gate for the public-source awareness flow.

### Optional pinned source-text rights manifest

An operator who has actual training permission can install a private local JSON
manifest and configure both `MAXCORE_TEXT_TRAINING_RIGHTS_MANIFEST` (its absolute
path) and `MAXCORE_TEXT_TRAINING_RIGHTS_SHA256` (the lower-case SHA-256 of its exact
bytes). The endpoint accepts neither a manifest path nor rights assertions from
the request. No grants or permissions are supplied by the repository.

The JSON object has exactly `schema: 1`,
`policy: "text-source-training-rights-v1"`, and `grants`, an array of 1..256
objects. Each grant has exactly these fields:

| Field | Required value |
| --- | --- |
| `source_id` | Exact scanner source ID, such as `mastodon_peak_music`; 1..80 letters, digits, underscores or hyphens. |
| `domain` | Exact `music`, `social`, `advertising` or `culture` domain. |
| `citation` | Exact observation citation, 1..4096 characters. |
| `text_sha256` | Lower-case SHA-256 of the complete UTF-8 post text, matching the existing observation hash. |
| `author` | Identified nonempty author, not `unattributed live observation`. |
| `license` | One of `CC0-1.0`, `CC-BY-4.0`, `MIT`, `Apache-2.0`. |
| `purpose` | `training`. |
| `rights` | The accountable permission/evidence object described below. |

`rights` requires `training_allowed: true`, nonempty `rights_holder` and
`attested_by`, `license` equal to the grant license, a timezone-aware
`attested_at` timestamp no later than now, and `evidence_path` plus
`evidence_sha256`. Optional `expires_at` must be later than now. Evidence paths
are relative to the manifest directory; absolute paths, `..`, URL/drive-style
paths and symlinks are rejected. Evidence bytes must match their SHA-256.

Manifest and evidence files must be regular local files without group/world
write permission; mode `0600` is recommended. Symlinks in any path component are
rejected. The manifest is limited to 2,000,000 bytes; each evidence file to 1 MiB,
and distinct evidence files to 4 MiB total. Every record in an admitted set must
match a grant by source ID, domain, exact citation and complete text hash;
duplicate JSON keys, duplicate grants, and invalid, expired, mismatched or missing evidence fail
closed with `blocked_training_rights`. Updating a file also requires updating
the pinned manifest fingerprint.

Accepted grants attach a separate `training_rights` receipt to audited corpus
inputs, binding admission time, the manifest fingerprint and exact grant. Original scanner
metadata remains `NOASSERTION`; it is not rewritten as if the scanner obtained a
license. The receipt records an operator attestation, not an independent legal
verdict. Keep the original operator manifest and permission evidence durably
alongside the model's audit records. Expiry is checked at training admission;
this check makes no claim about continuing output rights or quality. It does
not waive privacy, corpus, training, certification, operational generation or
quality checks, nor does installing it create a trained candidate.

## Validation boundaries

The trainer uses the complete validated public observation set. It does not
manufacture holdouts or describe training loss as general output quality. Public
live selection uses the measured numerical and provenance checks above, without
a manually maintained evaluation dataset or signed review. The separate
traditional-corpus policy retains its frozen evaluation protocol and signatures.

## Isolation, certification, recovery and retention

The service runs the existing candidate manifest trainer with `--manual-backward`.
It requires actual DigitalGPU forward/backward counters, exclusive-backend
evidence, changed parameters, finite losses, and matching checkpoint/input hashes.
There is no native CPU fallback. The trainer maintains its serving-artifact
preservation checks. Training and serving files remain separate.

A global nonblocking file lock is inherited by the worker supervisor and trainer.
The independent supervisor kills/waits its trainer after 110 seconds, even if the
API parent crashes; the API has a 120-second outer deadline. No unbounded queue
or concurrent learning run is admitted. The audit limit is 100 retained runs.

Before spawning any worker, the service durably creates a pending admission under
`ai_model/training/live_candidate_admissions/{run_id}/`. This is separate from
the candidate directory the existing trainer creates, avoiding mkdir races.
The parent publishes `result.json`, then atomically publishes `certified.json`
**last**, binding admission, result, report and checkpoint hashes. Files and
containing directories are fsynced. The registry refuses every `live-*` candidate
(and any manifest containing live provenance) unless this certification verifies.
Certification makes a public scanner candidate eligible for automatic numerical
serving validation. It is not a general quality verdict. Do not edit or manually
manufacture markers.

On startup, GET/list and new admission, reconciliation attempts the global lock.
While an inherited worker owns it, nothing is reconciled or concurrently trained.
Once released, any uncertified interrupted job is permanently
`failed_interrupted`, with a candidate `FAILED` marker when artifacts exist.
Even a complete worker report or pre-certification success result cannot recover
success automatically. The immutable `reconciled.json` overrides an earlier
uncertified result without deleting historical evidence. Submit a new run to retry.

Audit snapshots, corpus and automatically reserved holdouts live under
`ai_model/training/live_learning_runs/{run_id}/`; candidate model artifacts remain
under `candidate_runs/{run_id}/`. Keep admission/certification sidecars with
candidate bundles during archival; missing sidecars fail closed. Operators must
archive retained jobs deliberately before capacity is exhausted. No automatic
deletion or retrospective quality fabrication occurs.


Production packaging defaults to live awareness and does not require Git LFS,
`model.corrupt` or `model.pt`. Only explicit `MAXCORE_SERVING_RELEASE=legacy`
requires the pinned legacy checkpoint. Model state is independent of the
replaceable application capsules: the supervisor defaults `MAXCORE_MODEL_STATE_DIR`
to `models` beneath `MAXCORE_PRIVATE_STATE_DIR` (or `~/.local/state/maxcore`).
Mount that directory durably at the same absolute path on replacement instances.
It contains candidate runs, parent certifications, training audit and the registry;
traditional-mode review evidence and trust keys also need stable operator-managed paths. The
packager excludes those private runtime artifacts and does not serialize a
workspace's selected pointer into a capsule. A clean instance may start collecting
signals, but remains unready for generation until a verified release is available.

### Operational admission is distinct from public-source certification

Public scanner certification remains signature-free. It verifies provenance,
privacy and finite training/inference, not whether a checkpoint can write usable
content. Automatic selection now executes two bounded synthetic requests through
the actual ScriptAgent with its existing readability, metadata, safety and
required-section checks. These requests are interface probes, not a training
corpus or human review requirement. A failed candidate cannot replace an
operational incumbent. Startup repeats the probe on the selected public model;
without an operational model, readiness remains false and generation fails
explicitly. Successful probes do not certify general semantic quality.

The serving adapter returns only emitted continuation tokens, matching
CreativeModel. Conditioning/prompt text must never count as generated content.
The trainer initializes a small transformer only when no certified public learning
history exists. Later runs resume the newest verified public checkpoint, including
models that cannot yet serve prose. The checkpoint and report bind the parent hash
and exact initial weight digest. Changed ancestry or incompatible configuration
blocks the run rather than silently resetting. Only the configured bounded
optimization steps run; live public observations and finite loss alone do not
establish language generation capability. Improving
that capability requires a genuinely capable model/training path and measured
serving results; do not mask it with templates or relax the guards.
