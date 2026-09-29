# Operator contract: live text candidate learning

This service consumes fresh, validated snapshots from the existing live awareness
engine. It does not replace awareness with a static corpus, train serving weights,
claim quality, or promote candidates. It trains only on text already present in
the validated awareness snapshot; this endpoint does not fetch or scrape sources.
Candidate provenance records `NOASSERTION` and unknown privacy/attribution status,
not a claim that observations have a particular license or are nonprivate.

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

HTTP 201 / `candidate_trained_unreviewed` means measured isolated training and
parent certification succeeded, **not** that generation quality is acceptable.
Admission failures include `blocked_corpus`,
`blocked_awareness`, `blocked_busy`, `blocked_capacity`, and `blocked_bounds`.
Worker outcomes include `failed_training`, `failed_execution_evidence`,
`blocked_timeout` and `failed_interrupted`. Consult JSON `status`; failed runs
never return 201. `running` means the shared lock is still owned by a parent or
inherited worker, not that a checkpoint is eligible for review.

## Live source provenance and privacy

There is no rights-grant file or license-permission gate for this endpoint.
Each training record retains its awareness snapshot ID, observation ID, source,
citation, and text hash. Candidate metadata explicitly marks the license
`NOASSERTION`, privacy `unknown`, and attribution `unattributed live observation`.
The endpoint does not claim that sources granted training rights. It does not
turn feed visibility into a license, and does not retrieve any content outside
the already-collected snapshot.

Existing secret/personal-data screening and holdout-overlap checks still apply.
They are data-quality safeguards, not rights checks. Independently review
candidate provenance and applicable source constraints before release selection.

## Automatic snapshot holdout

The endpoint deterministically reserves one non-overlapping observation from the
current live snapshot and trains on the remaining observations. This split is
created and hash-bound for each run; there is no rights-grant or holdout file to
provision. If the snapshot has too little distinct content to make a valid split,
the run returns `blocked_corpus`.

This same-snapshot holdout prevents direct training/evaluation leakage for the
bounded candidate-training job. It is **not** an independent quality evaluation,
does not certify useful generation, and is not sufficient for release promotion.
Candidates still require the existing separate frozen, held-out quality protocol
and review before selection.

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
Certification authorizes only the existing independent review process; it is
not promotion or a quality verdict. Do not edit or manually manufacture markers.

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
deletion, production promotion, or retrospective quality fabrication occurs.