# Dynamic frontend endpoint review

Reviewed 2026-09-17 against the 15 `unresolvedDynamic` findings in
`reports/endpoint-audit.json`.  This is a source trace only; it does not make
live requests.  Route evidence below is from the mounted Express registrations
(method and normalized path).

## Result

* **9 findings resolve to concrete API calls with mounted backend matches:**
  autonomous dashboard, autopilot dashboard, embed workflow toggle,
  HyperFollow save, export dialog, unified inbox bulk actions, studio template
  query, Assistant calls, and music-workflow automation toggle.
* **2 findings are browser-upload helpers:** their endpoint arguments resolve at
  their callers to concrete `POST` routes (including avatar, storage, asset,
  studio, marketplace, advertising, storefront, and stem uploads).
* **2 findings are generic batch helpers:** the repository has no component
  consumer that supplies a different runtime resource; their internal
  convenience builders produce the concrete batch routes documented below.
* **2 findings are generic transport helpers:** they are not endpoint
  declarations.  `apiRequest` and the Assistant helper receive a method/path
  from their callers.  The Assistant helper's callers are fully traced here;
  the shared `apiRequest` implementation is used by the statically matched
  caller inventory.

No definite API path or method mismatch was found, so no application code was
changed.

## Findings

### 1. `client/src/components/autonomous/autonomous-dashboard.tsx:252`

* **Source:** `apiRequest("POST", endpoint, {})`; `endpoint` is selected from
  `shouldStart`.
* **Concrete calls:** `POST /api/advertising/start` when true, or
  `POST /api/advertising/stop` when false.
* **Mounted backend evidence:** `server/routes.ts:7268` mounts
  `server/routes/advertising.ts` at `/api/advertising`;
  `server/routes/advertising.ts:1240` registers `POST /start`, and
  `:1263` registers `POST /stop`.
* **Classification:** concrete backend matches; no mismatch.

### 2. `client/src/components/autopilot/autopilot-dashboard.tsx:193`

* **Source:** `apiRequest("POST", endpoint, {})`; `endpoint` is selected from
  `shouldStart`.
* **Concrete calls:** `POST /api/autopilot/start`, or
  `POST /api/autopilot/stop`.
* **Mounted backend evidence:** `server/routes.ts:7278` mounts
  `server/routes/autopilot.ts` at `/api/autopilot`;
  `server/routes/autopilot.ts:181` registers `POST /start`, and
  `:250` registers `POST /stop`.
* **Classification:** concrete backend matches; no mismatch.  The similarly
  named advertising-autopilot router is a separate mount and is not used by
  this caller.

### 3. `client/src/components/distribution/EmbedCodeGenerator.tsx:383`

* **Source:** `apiRequest("POST", endpoint, {})`; `endpoint` is selected from
  `wf.enabled`.
* **Concrete calls:** `POST /api/custom-workflows/:id/disable`, or
  `POST /api/custom-workflows/:id/enable`, where `:id` is `wf.id`.
* **Mounted backend evidence:** `server/routes.ts:8532` mounts
  `server/routes/customWorkflows.ts` at `/api/custom-workflows`;
  `server/routes/customWorkflows.ts:426` registers `POST /:id/enable`, and
  `:446` registers `POST /:id/disable`.
* **Classification:** concrete backend matches; no mismatch.

### 4. `client/src/components/distribution/HyperFollowBuilder.tsx:272`

* **Source:** `apiRequest(method, url, formData)`; `campaignId` selects both
  values.
* **Concrete calls:** `POST /api/distribution/hyperfollow` for a new campaign,
  or `PATCH /api/distribution/hyperfollow/:id` for an existing campaign.
  The `FormData` uses the backend's `headerImage` field and JSON `data` field.
* **Mounted backend evidence:** `server/routes.ts:7035` mounts
  `server/routes/distribution.ts` at `/api/distribution`;
  `server/routes/distribution.ts:1079` registers `POST /hyperfollow`, and
  `:1287` registers `PATCH /hyperfollow/:id`.
* **Classification:** concrete backend matches; no mismatch.

### 5. `client/src/components/export/ExportDialog.tsx:248`

* **Source:** `apiRequest("POST", endpoint, options)`; `activeTab` selects the
  endpoint and matching options object.
* **Concrete calls:** `POST /api/export/audio/:projectId`, or
  `POST /api/export/data`.
* **Mounted backend evidence:** `server/routes.ts:7716` mounts
  `server/routes/export.ts` at `/api/export`;
  `server/routes/export.ts:229` registers `POST /audio/:projectId`, and
  `:416` registers `POST /data`.
* **Classification:** concrete backend matches; no mismatch.

### 6. `client/src/components/social/UnifiedInbox.tsx:284`

* **Source:** `apiRequest("POST", endpoints[action], { messageIds })`; `action`
  is the closed union `archive | read | unread | delete`.
* **Concrete calls:** `POST /api/social/inbox/bulk/archive`,
  `POST /api/social/inbox/bulk/read`, `POST /api/social/inbox/bulk/unread`, or
  `POST /api/social/inbox/bulk/delete`.
* **Mounted backend evidence:** `server/routes.ts:7118` mounts
  `server/routes/socialMedia.ts` at `/api/social`; registrations are
  `POST /inbox/bulk/read` at `server/routes/socialMedia.ts:1586`,
  `POST /inbox/bulk/unread` at `:1618`, `POST /inbox/bulk/archive` at
  `:1650`, and `POST /inbox/bulk/delete` at `:1682`.
* **Classification:** concrete backend matches; no mismatch.

### 7. `client/src/hooks/useBatchAction.ts:197`

* **Source:** generic `apiRequest(method, url, body)` inside the batch
  transport.  `getEndpoint(resource, action)` builds
  `/api/batch/${resource}/${suffix}`.
* **Concrete internal builders:** distribution releases (`submit`, `takedown`,
  `update`, `delete`), social posts (`schedule`, `delete`, `update`),
  marketplace (`update`, `delete`), files (`delete`, `move`, `download`,
  `update`), and analytics (`export`, `compare`).  Their paths/methods are:
  `POST /api/batch/releases/submit`, `POST /api/batch/releases/takedown`,
  `PUT /api/batch/releases/update`, `POST /api/batch/releases/delete`;
  `POST /api/batch/posts/schedule`, `POST /api/batch/posts/delete`,
  `PUT /api/batch/posts/update`; `PUT /api/batch/marketplace/update`,
  `POST /api/batch/marketplace/delete`; `POST /api/batch/files/delete`,
  `POST /api/batch/files/move`, `POST /api/batch/files/download`,
  `PUT /api/batch/files/update`; and `POST /api/batch/analytics/export`,
  `POST /api/batch/analytics/compare`.
* **Mounted backend evidence:** `server/routes.ts:7049` mounts the batch router
  at `/api/batch` (the registrations are in `server/routes/batch.ts`):
  releases at
  `:46`, `:92`, `:138`, `:192`; posts at `:238`, `:285`, `:328`; marketplace
  at `:593`, `:647`; files at `:380`, `:429`, `:479`, `:536`; and analytics
  at `:691`, `:800`.
* **Classification:** generic batch transport.  Repository search found no
  component importing the convenience hooks; the concrete combinations above
  are the only in-repository builders, and all have backend matches.  The
  helper still accepts arbitrary `resource`/`action` values by API design, so
  an unlisted future caller would remain unresolved rather than justify a
  guessed route or a code change.

### 8. `client/src/hooks/useBatchActions.ts:263`

* **Source:** second generic batch transport implementation; `getEndpoint`
  builds `/api/batch/${resource}/${suffix}` and `pollJobProgress` separately
  uses `GET /api/batch/progress/:jobId`.
* **Concrete internal builders:** releases (`submit`, `delete`, `update`);
  tracks (`move`, `tag`, `export`, `delete`); posts (`schedule`, `delete`,
  `approve`); beats (`update`, `delete`); and analytics (`export`, `compare`).
  They produce `POST /api/batch/releases/submit`, `POST /api/batch/releases/delete`,
  `PUT /api/batch/releases/update`; `POST /api/batch/tracks/move`,
  `POST /api/batch/tracks/tag`, `POST /api/batch/tracks/export`,
  `POST /api/batch/tracks/delete`; `POST /api/batch/posts/schedule`,
  `POST /api/batch/posts/delete`, `POST /api/batch/posts/approve`;
  `PUT /api/batch/beats/update`, `POST /api/batch/beats/delete`; and
  `POST /api/batch/analytics/export`, `POST /api/batch/analytics/compare`.
  Job progress is `GET /api/batch/progress/:jobId`.
* **Mounted backend evidence:** `server/routes.ts:7049` mounts the batch
  router at `/api/batch`; `server/routes/batch.ts:46`, `:192`, `:138`
  register release routes; `:887`, `:936`, `:985`, `:1051` register track
  routes; `:238`, `:285`, `:1191` register post routes; `:1092`, `:1147`
  register beat routes; `:691`, `:800` register analytics routes; and
  `:1238` registers progress.  These are served by the mounted batch router.
* **Classification:** generic batch transport.  No component consumer was
  found beyond the internal convenience builders.  Every concrete builder
  combination has a mounted method/path match; arbitrary future resources are
  intentionally not guessed.

### 9. `client/src/hooks/useBulkAction.ts:171`

* **Source:** generic `apiRequest(method, endpoint, body)` where `resource` is
  a caller-provided string.  The helper's fixed suffix mapping is `delete`
  (`POST`), `update`/`status_change` (`PUT`), `export` (`POST`), `submit`
  (`POST`), `withdraw` (`POST`), `schedule` (`POST`), and `process` (`POST`).
* **Concrete callers:** no component or page imports the exported
  `useBulkDelete`, `useBulkUpdate`, `useBulkExport`, or
  `useBulkStatusChange` helpers.  Consequently there is no runtime
  `resource` value from which to claim a concrete endpoint.
* **Mounted backend evidence:** the fixed batch route family is represented by
  the registrations cited for finding 7, but no specific resource can be
  mounted/evidenced for this unused generic entry.
* **Classification:** unresolved-by-design generic helper, not a confirmed
  API mismatch.  No path or method fix is justified.

### 10. `client/src/hooks/useTemplate.ts:141`

* **Source:** `apiRequest("GET", endpoint)`; `type` selects the query.
* **Concrete calls:** `GET /api/studio/templates`, or
  `GET /api/studio/templates?category=:type` (URL-encoded value).
* **Mounted backend evidence:** `server/routes.ts:7325` mounts
  `server/routes/studio.ts` at `/api/studio`; `server/routes/studio.ts:4775`
  registers `GET /templates`.
* **Classification:** concrete backend matches; no mismatch.

### 11. `client/src/lib/imageUpload.ts:19`

* **Source:** reusable browser file-upload helper; it accepts an endpoint and
  always calls `apiRequest("POST", endpoint, FormData)`.
* **Concrete callers:** `POST /api/storage/upload` (MerchStore and Marketplace
  cover-art flows) and `POST /api/auth/avatar` (WelcomeWizard and WelcomeFlow).
* **Mounted backend evidence:** `server/routes.ts:7702` mounts
  `server/routes/storage.ts` at `/api/storage`; `server/routes/storage.ts:198`
  registers `POST /upload`.  The auth avatar route is registered directly at
  `server/routes.ts:1440` as `POST /api/auth/avatar`.
* **Classification:** browser upload helper with concrete backend matches; no
  mismatch.  The endpoint parameter is intentional because the helper is
  shared by two upload route families.

### 12. `client/src/lib/queryClient.ts:360`

* **Source:** the shared `apiRequest(method, url, data, options)` transport
  itself; it passes the caller-provided values to `fetch` and has no endpoint
  declaration.
* **Concrete paths/methods:** all endpoint-bearing callers are inventoried by
  the static audit; the dynamic caller expressions in this review are
  expanded in findings 1–11, 13–15.  There is no additional URL hidden in
  this implementation.
* **Mounted backend evidence:** not applicable to this client-side transport
  primitive; backend evidence belongs to each caller and is cited above.
* **Classification:** generic transport wrapper, not an unresolved backend
  endpoint and not a path/method mismatch.

### 13. `client/src/lib/queryClient.ts:457`

* **Source:** reusable `uploadWithProgress(url, data, options)` browser XHR
  helper.  Its implementation unconditionally opens `POST` at line 474.
* **Concrete callers and paths:** `POST /api/storage/upload` (SocialMedia and
  press-kit photo uploads), `POST /api/advertising/upload-image`
  (Advertisement), `POST /api/marketplace/upload` (Marketplace single and
  bulk beat uploads), `POST /api/marketplace/listings/:listingId/stems`
  (StemUploadDialog), `POST /api/assets/upload` (AssetUploadDialog),
  `POST /api/studio/upload` (FileUploadZone), and
  `POST /api/storefront/upload-asset` (StorefrontBuilder).
* **Mounted backend evidence:** storage is mounted at
  `server/routes.ts:7702`, with `POST /upload` at
  `server/routes/storage.ts:198`; advertising is mounted at
  `server/routes.ts:7268`, with `POST /upload-image` at
  `server/routes/advertising.ts:1141`; marketplace is mounted at
  `server/routes.ts:7563`, with `POST /upload` at
  `server/routes/marketplace.ts:1592` and `POST /listings/:listingId/stems`
  at `:2920`; `POST /api/assets/upload` is registered directly at
  `server/routes.ts:5387`; studio is mounted at `server/routes.ts:7325`,
  with `POST /upload` at `server/routes/studio.ts:2786`; and storefront is
  mounted at `server/routes.ts:7164`, with `POST /upload-asset` at
  `server/routes/storefront.ts:1150`.
* **Classification:** browser upload helper with concrete backend matches; no
  mismatch.  The scanner cannot infer the XHR method from the helper's
  computed `url` parameter, but the implementation and every caller establish
  `POST`.

### 14. `client/src/pages/Assistant.tsx:90`

* **Source:** local `apiFetch(path, options)` helper; it defaults
  `options.method` to `GET` and forwards the supplied path to `apiRequest`.
* **Concrete callers:** `GET /api/assistant/history`,
  `GET /api/assistant/history?before=:messageId`,
  `POST /api/assistant/chat`, and `DELETE /api/assistant/history`.
  Callers are at lines 147, 190, 236, and 291 respectively.
* **Mounted backend evidence:** `server/routes.ts:8542` mounts
  `server/routes/assistant.ts` at `/api/assistant`; `server/routes/assistant.ts:60`
  registers `GET /history`, `:166` registers `POST /chat`, and `:256`
  registers `DELETE /history`.
* **Classification:** generic local transport helper with all concrete callers
  resolved to mounted matches; no mismatch.

### 15. `client/src/pages/MusicWorkflowAutomations.tsx:247`

* **Source:** `apiRequest("POST", url, body)`; `enable` selects the path and
  only the enable branch sends the config body.
* **Concrete calls:** `POST /api/music-workflow-automations/:templateId/enable`,
  or `POST /api/music-workflow-automations/:templateId/disable`.
* **Mounted backend evidence:** `server/routes.ts:8424` mounts
  `server/routes/musicWorkflowAutomations.ts` at
  `/api/music-workflow-automations`; `server/routes/musicWorkflowAutomations.ts:77`
  registers `POST /:templateId/enable`, and `:110` registers
  `POST /:templateId/disable`.
* **Classification:** concrete backend matches; no mismatch.
