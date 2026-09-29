# Operator contract: live text candidate learning

This service consumes fresh, validated snapshots from the existing live awareness
engine. It does not replace awareness with a static corpus, train serving weights,
claim quality, or promote candidates. Public feed visibility is **not** training
permission. A rights grant authorizes only the exact observed sanitized text.

## Admin endpoints

Use the existing MaxCore admin authentication (`X-Admin-Key`, or its supported
admin bearer credential). Ordinary generation/train-scoped keys are insufficient.

* `POST /api/training/candidates/live` with `{"steps": 4}` starts one synchronous,
  isolated run. `steps` is an integer from 1 through 64; extra fields are rejected.
  Callers cannot supply a corpus, holdout, rights declaration, output path or model.
* `GET /api/training/candidates/live` lists retained run IDs and terminal/current
  metadata. Use this after a disconnected POST or server restart.
* `GET /api/training/candidates/live/{run_id}` returns that run's metadata.
  Neither GET exposes source text, holdout prompts or operator file paths.

HTTP 201 / `candidate_trained_unreviewed` means measured isolated training and
parent certification succeeded, **not** that generation quality is acceptable.
Admission failures include `blocked_rights`, `blocked_holdout`, `blocked_corpus`,
`blocked_awareness`, `blocked_busy`, `blocked_capacity`, and `blocked_bounds`.
Worker outcomes include `failed_training`, `failed_execution_evidence`,
`blocked_timeout` and `failed_interrupted`. Consult JSON `status`; failed runs
never return 201. `running` means the shared lock is still owned by a parent or
inherited worker, not that a checkpoint is eligible for review.

## Operator-pinned rights

Set `MAXCORE_LIVE_RIGHTS_PATH` to a local reviewed UTF-8 JSON file and
`MAXCORE_LIVE_RIGHTS_SHA256` to the SHA-256 of its **exact bytes**. The maximum
file size is 2,000,000 bytes. Schema:

```json
{
  "schema": 1,
  "grants": [
    {
      "record_id": "<exact snapshot observation ID>",
      "text_sha256": "<SHA-256 of exact UTF-8 sanitized observation text>",
      "source": "<exact snapshot source identifier>",
      "citation": "<exact snapshot citation URL>",
      "training_permitted": true,
      "private": false,
      "license": "<supported SPDX identifier>",
      "author": "<actual rights holder>",
      "reviewer": "<independent rights reviewer>",
      "evidence": "<actual review/permission evidence reference>",
      "expires_at": 1900000000
    }
  ]
}
```

The example is a schema, **not** a usable grant or assertion of rights. Supply
real evidence and an appropriate expiry (Unix seconds). Supported identifiers
are `CC0-1.0`, `CC-BY-4.0`, `MIT`, and `Apache-2.0`. A collection-level license
does not establish permission for underlying text. Source, citation, record ID
and text fingerprint must all match; ambiguous duplicate grants are ineligible.
There are at most 10,000 grants. Unlicensed observations are excluded and counted;
zero eligible observations blocks admission. This operator-controlled file and
its pin are the trust boundary; HTTP callers cannot add grants. Protect both
from unauthorized edits. Do not put credentials or personal data in evidence.

## Independent frozen holdout

Set `MAXCORE_LIVE_HOLDOUT_PATH` and `MAXCORE_LIVE_HOLDOUT_SHA256` similarly.
The exact-byte pin must come from an independently frozen evaluation protocol:

```json
{
  "schema": 1,
  "frozen": true,
  "decoding": {"method": "greedy"},
  "cases": [
    {"id": "independent-case-id", "prompt": "<independent prompt>",
     "expected": "<optional independent reference>", "max_new_tokens": 16}
  ]
}
```

Use 1–64 uniquely identified cases and nonempty prompts. Prompt/reference
normalized overlap with selected live text blocks the entire run. Holdouts are
archived separately and never packed into training tokens. Publishing a pin is
an operator attestation of independence, not independent review by this service.
No real rights file, frozen evaluation or quality certification is bundled.

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

Audit snapshots, corpus, rights and holdouts live under
`ai_model/training/live_learning_runs/{run_id}/`; candidate model artifacts remain
under `candidate_runs/{run_id}/`. Keep admission/certification sidecars with
candidate bundles during archival; missing sidecars fail closed. Operators must
archive retained jobs deliberately before capacity is exhausted. No automatic
deletion, production promotion, or retrospective quality fabrication occurs.