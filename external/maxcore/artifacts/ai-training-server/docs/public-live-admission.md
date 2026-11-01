# Public-live learning admission

The configured live-awareness engine is the source for automatic learning.
The learner validates its observation-set identity and, for peak learning,
complete public posts with measured engagement before building the corpus.

At that internal boundary, validated public observations use the existing
live-corpus admission path. They retain `NOASSERTION` licensing and their
original attribution/provenance. A hash-bound `learning_admission` record
identifies the observation, not a copyright license or rights attestation.

This is not an HTTP option: callers cannot submit arbitrary training records
or switch admission policies through a generation request. Unknown-license
direct calls to the grant validator remain grant-only unless the trusted
engine boundary explicitly selects public-live admission. The existing
explicitly licensed corpus path is unchanged.

If either `MAXCORE_TEXT_TRAINING_RIGHTS_MANIFEST` or
`MAXCORE_TEXT_TRAINING_RIGHTS_SHA256` is configured, the existing explicit
grant path takes precedence. Partial, invalid, expired, mismatched, or
tampered grants still fail closed; public admission is not a recovery path
for broken grant configuration.

Private records, corrupt provenance, mixed observation sets, and injected
admission/rights receipts cannot use public-live admission. Corpus screening,
bounded isolated training, checkpoint certification, operational capability
verification, and atomic release selection remain independent requirements.
Training success alone never marks a model ready or promotes it.
