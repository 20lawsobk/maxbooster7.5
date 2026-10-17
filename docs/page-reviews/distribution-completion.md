# Distribution completion implementation

Scope: continued the previously identified draft/submission gaps. This is not a whole-page readiness certification.

## Implemented in the owned files

### Coordinator verification follow-up

Ran `node_modules/.bin/vitest run --config vitest.config.ts --maxWorkers=1 tests/unit/distribution-draft-flow.test.ts tests/unit/distribution-completion-contracts.test.ts`.
Initial result: 12 passed, 1 failed. The failure exposed a real PATCH bug:
partial schemas still supplied create-time explicit-content and territory
defaults, overwriting omitted fields. Release and track edit schemas now
explicitly omit those defaults.

Replaced the outdated wizard source-shape assertion with execution of the real
`persistDraft` helper: a failed media upload retains the acknowledged release ID,
and a retry PATCHes it rather than creating a duplicate release.

Final result: **exit 0, 14 passed, 2 files**, 2026-10-17 13:46:35, 2.20 seconds.
Log: `/tmp/distribution-completion-tests.log` (temporary). This supersedes the
earlier unexecuted-test and obsolete-assertion notes below. Browser, provider,
real database concurrency, and production-start acceptance remain unverified.

- Release cards now offer **Review & complete** for draft/rejected releases. The details dialog's edit action also opens that completion path for editable releases.
- The wizard fetches the owned single-release endpoint, hydrates saved metadata, assigned UPC, confirmations, destinations, territories, schedule, splits, artwork, and actual persisted track rows. A failed load is an explicit blocking error rather than an empty new draft.
- Single-release GET includes the release's tracks. Track upload accepts an assigned ISRC; track PATCH writes real columns separately from JSON metadata, preserving existing metadata and audio. Provider payload construction reads explicit/lyrics from the actual persisted track metadata.
- Incomplete drafts can be saved and navigated without completing submission-only requirements. Blank AI selections are omitted, not converted to declarations. Submission requires the real UPC/ISRCs, artwork, metadata, date, destinations, composer, truthful AI declarations, and affirmative terms/rights confirmations. AI-assisted submissions remain explicitly blocked because provider documentation uploads are not implemented.
- Saving persists selected media as well as metadata. Existing audio/artwork is retained unless replacement artwork is chosen. Acknowledged track uploads are checkpointed in the wizard and PATCHed on retry, not re-POSTed. A scoped `clientUploadId` persisted in track metadata also recovers a response-lost upload on a subsequent POST for the same owned draft. Artwork acknowledgement is checkpointed in memory.
- Corrected the track payload to numbered tracks, a per-track `explicit` boolean and per-track lyrics string. Also aligned the wizard with the actual LyricsEditor, TerritorySelector, ReleaseDateScheduler, and ArtworkUploader prop contracts.
- Artwork and track upload/PATCH now reject changes after draft/rejected status. Existing authentication, ownership checks, live destination validation, provider submission repository/idempotency/checkpoints, provider identifiers and pricing/guarantee copy were not replaced.
- Failed submission never invokes the submitted-success callback or creates a pre-save campaign. Campaign-creation failure no longer claims the campaign is live.

## Verification actually performed

- Targeted source/contract inspection and `git diff --check` for the owned implementation/test paths: no whitespace errors reported.
- Added `tests/unit/distribution-completion-contracts.test.ts`: draft schema/confirmation/identifier cases, track schema cases, pure provider payload construction with the submission repository mocked, and clearly labeled source guards for hydration, retry/callback and child component contracts.
- **No test process was run.** The initial memory check reported approximately **1,044 MiB available**, below the requested 1.5 GiB floor. No LSP, typecheck, build, browser, workflow, install or provider-account operation was performed. The new tests are unexecuted, not passing evidence.

## Remaining verification and bounded limitations

- Browser rendering/interactions, authenticated requests, actual DB persistence, media storage, concurrent requests, Too Lost delivery and campaign creation remain unverified.
- Upload recovery is scoped to a persisted client upload ID. It is not an atomic cross-request media deduplication guarantee: concurrent requests can race the lookup/insert without a storage-level uniqueness transaction. Replacement artwork whose response is lost may be uploaded again. Neither limitation changes provider submission idempotency.
- Existing source-shape assertions in `tests/unit/distribution-draft-flow.test.ts`, specifically “sends draft data as JSON and includes royalty splits for save and submit,” reference the old inline mutation body and `draftReleaseId ? "PATCH" : "POST"` string. The implementation now centralizes JSON metadata/splits and media persistence in `persistDraft`/`releasePayload`, and uses a synchronous release-ID ref for retry safety. Those coordinator-owned assertions need updating to the new helper shape or preferably behavioral coverage; that existing test file was not edited.
- Existing audio is retained, not replaced/deleted through this wizard; users can edit its title, assigned ISRC, explicit designation and lyrics. Saving partly completed uploads may leave a partially saved draft if a later request fails, and the error is surfaced.
- No shared storage, service, root routes, authentication, configuration, or schema changes were made or are required for this bounded completion path. Atomic concurrent media deduplication would require coordinator-owned storage/schema work if that stronger guarantee is desired.
- Do not mark the whole Distribution page ready from these fixtures or static checks. Account-level earnings isolation, dispatch persistence concurrency, other child panels, and deployment/runtime verification remain with the coordinator's broader work.
