# Social Media / Advertisement review

## Status and scope

**Not ready / authenticated UI unverified.** This is a bounded frontend repair pass, not end-to-end certification.

Initial pass edited only the two page files, `tests/unit/social-ad-page-contracts.test.ts`, and this review. The coordinator subsequently expanded ownership to `client/src/components/social/SchedulePostDialog.tsx`; that dialog, its owned parent callback, and `tests/unit/social-ad-page-dialog.test.ts` were updated in the follow-up below. Backend routes/services and all other shared components remain read-only. No workflow restart, full build/typecheck, secret access, database changes, deployments, real uploads, email sends, social posts, campaign activations, or payments were performed.

Canonical $49 / $468 / $699 pricing and the 90-day guarantee were not changed.

## Actual evidence

- Preview screenshots of `/social-media` and `/advertising`, both at 1280×720, showed the sign-in screen and cookie notice. They did **not** show either signed-in page or its child panels. Temporary screenshot evidence: `/tmp/replit-screenshots/social-media_fwr1.jpg` and `/tmp/replit-screenshots/advertising_GEbN.jpg`. No authentication bypass was introduced.
- Focused Vitest checks execute extracted, transpiled callbacks from the actual page source with in-memory dependency stubs. They do not import server services or call providers. Coverage includes media attachments, ISO scheduling, pending/failed uploads, duplicate-submit guard, queued-post edit rejection, draft editing, honest recommendation feedback, upload-response validation, honest audience draft payload, first-time EPK save, and rejected clipboard writes. This is callback/contract evidence, not a rendered React interaction test.
- Both edited TSX files are parsed/transpiled for syntax diagnostics in that focused suite. This is **not** a full typecheck; existing `@ts-nocheck` remains.
- Existing `advertisement-generation-contract.test.ts` and `social-platform-status.test.ts` were also run.
- Focused command: `npx vitest run --config vitest.config.ts tests/unit/social-ad-page-contracts.test.ts tests/unit/advertisement-generation-contract.test.ts tests/unit/social-platform-status.test.ts`.
- Initial focused run: **3 files passed, 38 tests passed**. Scoped `git diff --check` also passed. The runner emitted an existing Vitest `poolOptions` deprecation warning; no configuration was changed.

## Follow-up: asynchronous SchedulePostDialog persistence

- `onSchedule` now requires a persistence promise. The dialog awaits it, closes/resets only after resolution, and preserves all form fields, media URLs, chips and unfinished hashtag/mention input after rejection. A void callback is explicitly rejected, not treated as successful persistence.
- Pending state has visible status text and `aria-busy`; errors have `role="alert"`. The native fieldset, custom selection controls and both save actions are disabled while saving. A synchronous ref guard prevents same-tick double clicks before React rerenders. Escape/outside dismissal and the dialog open-change path are blocked during persistence.
- The live `SocialMedia.handleSchedulePost` now awaits `mutateAsync` for both create and update and propagates rejection. Removed mutation-level dialog close/reset; the dialog owns success dismissal, and the parent clears the selected edit record when it receives that dismissal.
- `social-ad-page-dialog.test.ts` executes actual extracted dialog/parent callbacks with deferred persistence promises. It covers draft and scheduled save resolution/rejection, no premature reset/close, complete preserved input, pending double clicks/dismissal, retry after rejection, legacy void-handler rejection, parent create/update propagation, markup wiring and TSX syntax. These are callback tests with local state dependencies, not browser-mounted React tests.
- The existing server-render smoke test is also included. A screenshot still cannot reveal an interaction-only authenticated dialog; full Radix focus, keyboard, disabled-control rendering and signed-in browser interaction remain unverified.
- Follow-up preview capture of `/social-media` again showed sign-in, not the dialog (`/tmp/replit-screenshots/social-media_m2bt.jpg`). No signed-in visual verification is claimed.
- Expanded focused run: `npx vitest run --config vitest.config.ts tests/unit/social-ad-page-dialog.test.ts tests/unit/social-ad-page-contracts.test.ts tests/unit/schedule-post-dialog.test.ts tests/unit/advertisement-generation-contract.test.ts tests/unit/social-platform-status.test.ts`: **5 files / 51 tests passed**.

### All source call sites inspected

Targeted repository search excluding dependency/build output found one live app caller, `client/src/pages/SocialMedia.tsx`, now adapted. `vite.config` resolves root to `client` and `@` to `client/src`; the following duplicate/reference source trees are not live app callers under that configuration and were inspected read-only:

- `AI enhancements/SocialMedia.tsx`
- `maxbooster7.5/AI enhancements/SocialMedia.tsx`
- `maxbooster7.5/client/src/pages/SocialMedia.tsx`
- `maxbooster7.5/maxbooster7.5/AI enhancements/SocialMedia.tsx`
- `maxbooster7.5/maxbooster7.5/client/src/pages/SocialMedia.tsx`

Each still defines a void `handleSchedulePost` using `.mutate`, so none should be promoted to the live app unchanged. **Proposed coordinator patch for each of those exact paths if retained/activated:** make `handleSchedulePost` async, await `updateCalendarPostMutation.mutateAsync({ postId: editingCalendarPost.id, data })` or `createCalendarPostMutation.mutateAsync(data)`, remove `setScheduleDialogOpen(false)` and `setEditingCalendarPost(null)` from mutation success callbacks, and replace the raw dialog `onOpenChange` setter with a callback that clears `editingCalendarPost` only when closing. No out-of-scope file was changed.

The two duplicate dialog implementations at `maxbooster7.5/client/src/components/social/SchedulePostDialog.tsx` and `maxbooster7.5/maxbooster7.5/client/src/components/social/SchedulePostDialog.tsx` retain the old void/reset contract; if those trees are activated, apply the same promise/ref/pending/error/success-only reset changes there. The read-only existing `tests/unit/schedule-post-dialog.test.ts` caller uses a spy solely for static server rendering and never invokes persistence.

## Verified defects repaired

### Social Media

- Composer uploads previously reported success without retaining the storage response URL; scheduling omitted uploaded/generated media entirely. Retains `file.url`, rejects missing saved URLs, resolves relative storage URLs against the app origin for the backend absolute-URL schema, rejects blob/local-only preview URLs, sends `mediaUrls` and the correct image/video `mediaType`, blocks pending/failed uploads and repeat submissions, and resets attachment state only after successful scheduling. This does not prove provider access to private storage.
- Converts local schedule values to ISO strings rather than passing timezone-ambiguous input. Schedule list reads backend `scheduledAt`, retaining legacy `scheduledTime` support.
- Schedule-list Edit previously populated a create-only composer; its discarded editing ID meant the next submission created another post. Queued posts now explicitly explain the backend's edit restriction. Drafts open the existing calendar update dialog and retain their ID. Calendar initial platform values are translated to the child dialog's IDs.
- OAuth error details were already decoded by `URLSearchParams`; a second `decodeURIComponent` could throw on literal percent signs. Removed the second decode.
- AI insight actions had only a success toast and no action implementation. Feedback now explicitly states that manual review is needed and nothing was performed.
- Calendar update feedback distinguishes draft saved from queued, not published, and invalidates both calendar and posts.
- Radio-pitch create/status and fan-campaign create/delete failures now show explicit errors; successful mutations invalidate their corresponding stats as well as lists.

### Advertisement

- Audience creation fabricated `expansionLevel * 100_000` people and claimed a build was running, although the route only stores a settings record. Removed the fabricated size, saves a draft, and describes planning/status changes honestly. Missing similarity/size/expansion measurements show “Not available” rather than malformed metrics.
- Normalizes OAuth provider platform-status results using the existing social-platform helper rather than displaying aggregate/alias provider rows as account-facing connections.
- The empty-network “Connect Profile” button now links to Social Media instead of doing nothing.
- Upload completion requires an actual persisted image URL before success. Creation also blocks pending/blob-only images.
- Promotable-content query loading/errors no longer permit generation; required selections must still exist and be promotable. Campaign-list query failure is visible with a retry action instead of silently presenting empty totals as verified zero.
- The create form's headings described immediate activation/publication despite creating a draft. They now describe a campaign draft and the separate activation step.

### Embedded EPK editors on both pages

- First-time save no longer dereferences a null press kit (`GET /api/press-kit` can return no kit).
- Query failure blocks editing rather than presenting an empty form that could overwrite an existing kit.
- Clipboard success is shown only after the promise resolves; denial is explicit.
- Photo upload must include a saved URL; photo removal tolerates a missing photo array.

## Contract evidence inspected read-only

- `server/routes/socialMedia.ts`: posts response normalizes text/platforms/media, schedule endpoint accepts `mediaUrls`, `mediaType`, and `scheduledAt`; draft calendar PUT updates existing IDs; queued/delivered posts reject in-place edits.
- `server/routes/storage.ts`: normal upload responds with `success` and `file.url`.
- `server/routes/advertising.ts`: image upload responds with `success` and `url`; audience POST persists a settings record, not a provider-built audience; campaign activation is a separate dispatch endpoint.
- `server/routes/pressKit.ts`, `radioPitches.ts`, and `fanCampaigns.ts`: inspected their corresponding page contracts without invoking write/send routes.

## Required coordinator-owned fixes / limitations

1. **Resolved in the follow-up above:** the live shared SchedulePostDialog now awaits persistence, preserves rejected input and blocks duplicate actions/dismissal while pending. Browser-mounted interaction evidence remains outstanding; duplicate source trees were not changed.
2. **Direct calendar publishing is unavailable.** Single and batch publish endpoints in `server/routes/socialMedia.ts` deliberately return HTTP 409 because they have no provider-delivery integration. Connect them to the real queue/delivery path with ownership, idempotency and reconciliation, returning queued vs provider-confirmed statuses accurately. Do not replace the 409 with a fabricated published response. Existing page publish controls will continue to show errors until that work is complete.
3. **Lookalikes are planning records, not operational audiences.** POST/PATCH `/api/advertising/lookalike-audiences` only write settings. To support real building/targeting, implement a provider-backed audience job, persist expansion/source/platform configuration, and return measured size/similarity/job state. Currently the expansion selector is represented in the profile name, not persisted as an independently supported backend field. Page wording now disclaims real audience creation.
4. **Child-panel auth/rendered tests are still required.** The screenshot browser was unauthenticated. No signed-in tab, dialog, mobile layout, keyboard operation, form validation, upload flow, provider delivery, worker lifecycle, or public EPK visibility was visually verified. No panel below is certified by this pass.
5. **Private media is not automatically provider-fetchable.** `storageService.getDownloadUrl` returns `/api/storage/file/...` and that storage route is authenticated. `autoPostingServiceV2.ts` contains direct `axios.get(content.mediaUrl)` downloads without the user's session and supplies `content.mediaUrl` directly as provider `image_url`/`video_url` (for example Threads). Resolving relative URLs in the frontend fixes request-schema rejection, not private file authorization. The coordinator must resolve owned storage keys server-side for byte-upload providers and issue scoped, expiring provider-readable media grants for URL-fetch providers; do not make the whole storage route public or forward session cookies to providers. Real provider delivery remains unverified.

## Child-panel inventory and unreviewed surface

“Source inventoried” below means identifying wiring only, not a full child implementation review.

| Page / panel | Evidence and remaining review |
| --- | --- |
| Social overview, schedule, analytics, AI insights | Page handlers inspected; schedule and recommendation repairs tested. Charts, trends, metrics accuracy, query failure states and responsive rendering still require signed-in verification. |
| Social create: regular / URL / generated media | Composer attachment path tested. AIImageGenerator, ServerVideoGenerator, multimodal output rendering, per-platform Use Content, audio, downloads, and URL-generation panels not end-to-end verified. |
| Social calendar | ContentCalendarView, PostTimelineView and BatchEditPanel source inventoried. SchedulePostDialog persistence repaired and callback-tested in follow-up. Browser interaction, batch destructive confirmations, selection lifecycle, drag/drop and publishing need review. |
| Social inbox | UnifiedInbox source inventoried: inbox/templates/team queries, sync/reply/assign/archive/bulk actions, snooze dialog. Provider operations, child dialogs and failure paths unverified. |
| Social listening | SocialListening query inventory: keywords, trending, influencers, alerts. Child tabs, filters and controls unverified. |
| Social competitors | CompetitorBenchmarking queries competitors/your-stats. Child comparisons and empty/error states unverified. |
| Social autopilot | AutopilotDashboard uses `/api/autopilot/status` and mutation routes; ContentAnalyzer is embedded alongside it. Configuration/start/stop, analyzer and real worker behavior not exercised. |
| Social press kit | Page-local callback repairs tested. Upload, publish switch, public URL, required fields and photo persistence unverified. |
| Social radio/press | Page-local create/status error handling and list/stats invalidation repaired. Filter/new-pitch dialog, status persistence, and tracking vs actual outreach still need interaction review. |
| Social fan campaigns | Page-local draft/delete failures repaired; send acceptance remains explicitly not delivery. Templates, consent/audience selection, send reconciliation, delivery stats and delete dialog unverified. No emails sent. |
| Advertising campaign creation/list/edit/delete/activation | Draft wording/upload/connection fixes source-reviewed; campaign mutations not exercised. Budget/date validation, confirmations, pause/resume semantics and partial provider failures unverified. |
| Advertising content promotion | Promotable selection guards and saved-draft preview source-reviewed; no generation call made. All content types and actual owned-content readiness need verification. |
| Advertising creative generation | CreativeVariantGenerator, AIImageGenerator, ServerVideoGenerator, VideoContentGenerator source inventoried. Server/browser video, images, attaching creatives, selection races and generated previews unverified. |
| Advertising testing | CreativeAutomation source inventoried (`/api/advertising/ab-tests`). Its creation/detail/winner flow not reviewed end-to-end. |
| Advertising lookalikes | Fabricated size removed and records described honestly. Provider functionality remains absent as noted above. No audience record was created or changed. |
| Advertising competitor/network panel | Connection normalization repaired. This panel presents personal network data; deeper recommendation/connection controls and displayed metrics not verified. |
| Advertising optimization | Audience-overlap and creative-fatigue nested tabs inventoried. Segment data, refresh/pause semantics, metric provenance and failure handling remain unverified. |
| Advertising autopilot | AutonomousDashboard uses `/api/advertising/status`; ContentAnalyzer is embedded. Configure/start/stop and real dispatch behavior unverified. |
| Advertising press kit | Same page-local EPK repairs tested; signed-in/public rendering and persistence still unverified. |
