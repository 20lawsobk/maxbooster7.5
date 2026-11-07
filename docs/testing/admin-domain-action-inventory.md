# Admin-visible domain action inventory

Generated from `docs/testing/admin-gap-inventory.json` at source revision `c8fe48fbd1f5a01797b4427a70baa4673cfc7423`.
Inventory SHA-256: `b86f82dc85c246ee88f93b44567da5fc2337de88ad6fa2e8adeeaca9776e2998`.

This is a source inventory, not evidence that each operation succeeds. Page files identify admin-visible surfaces; registered route declarations show their server entry points. Service, storage, schema, and worker imports are listed where statically resolvable. Provider-dependent operations remain blocked unless an acceptance receipt says otherwise.

## Domains

### artists

Source acceptance: **UNVERIFIED**. Inventory contains 3 UI page files, 3 route/worker source files, 41 declared handlers, and 0 unresolved declarations.

UI pages:
- `client/src/pages/PressKit.tsx` — UI API references: `/api/press-kit`, `/api/storage/upload`
- `client/src/pages/ProducerProfilePage.tsx` — UI API references: `/api/marketplace/beats?producerId=${producerId}`, `/api/marketplace/follow/${producerId}`, `/api/marketplace/producers`, `/api/marketplace/producers/${producerId}`, `/api/marketplace/producers/${producerId}/follow-status`, `/api/marketplace/purchase`, `/api/marketplace/unfollow/${producerId}`
- `client/src/pages/PublicPressKit.tsx` — UI API references: `/api/press-kit/public`, `/api/press-kit/public/${slug}`

Server route and worker actions:

- `server/routes/artistProfiles.ts` (mounted at `/api/artist-profiles`) — 29 declared action(s).
  - `GET /api/artist-profiles/:id/discovery-job`
  - `GET /api/artist-profiles/`
  - `POST /api/artist-profiles/`
  - `GET /api/artist-profiles/search`
  - `GET /api/artist-profiles/by-release/:releaseId`
  - `GET /api/artist-profiles/:id`
  - `PATCH /api/artist-profiles/:id`
  - `DELETE /api/artist-profiles/:id`
  - `POST /api/artist-profiles/:id/fixer`
  - `GET /api/artist-profiles/:id/profile-hub`
  - `POST /api/artist-profiles/:id/auto-discover`
  - `POST /api/artist-profiles/:id/auto-sync`
  - `POST /api/artist-profiles/:id/link-release/:releaseId`
  - `POST /api/artist-profiles/:id/verify`
  - `POST /api/artist-profiles/:id/isrc-discover`
  - `POST /api/artist-profiles/:id/scan-splits`
  - `GET /api/artist-profiles/:id/claim-pipeline`
  - `PATCH /api/artist-profiles/:id/claim-state`
  - `GET /api/artist-profiles/:id/health`
  - `GET /api/artist-profiles/:id/identity-graph`
  - `POST /api/artist-profiles/:id/dna-snapshot`
  - `GET /api/artist-profiles/:id/dna-snapshots`
  - `POST /api/artist-profiles/:id/fixer-multi`
  - `POST /api/artist-profiles/:id/import-history`
  - `GET /api/artist-profiles/:id/portability-report`
  - `POST /api/artist-profiles/:id/resolve-handle`
  - `POST /api/artist-profiles/:id/watch`
  - `GET /api/artist-profiles/:id/catalog`
  - `POST /api/artist-profiles/:id/distribute-release`
  - Local service/schema/storage dependencies: `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/requestValidation.ts`, `server/services/artistProfileService.ts`, `server/services/catalogDiscoveryJobs.ts`, `server/services/distributionDataTransferService.ts`, `server/services/toolost-service.ts`, `server/storage`

- `server/routes/artistProgress.ts` (mounted at `/api/artist-progress`) — 5 declared action(s).
  - `GET /api/artist-progress/dashboard`
  - `GET /api/artist-progress/history`
  - `GET /api/artist-progress/milestones`
  - `GET /api/artist-progress/growth-metrics`
  - `POST /api/artist-progress/capture-snapshot`
  - Local service/schema/storage dependencies: `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/errorHandler.ts`, `server/services/artistProgressService.ts`

- `server/routes/pressKit.ts` (mounted at `/api/press-kit`) — 7 declared action(s).
  - `GET /api/press-kit/`
  - `PUT /api/press-kit/`
  - `POST /api/press-kit/photo`
  - `DELETE /api/press-kit/photo/:index`
  - `GET /api/press-kit/public/:slug/photo/:index`
  - `GET /api/press-kit/public/:slug`
  - `POST /api/press-kit/publish`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/apiCache.ts`, `server/middleware/auth.ts`, `server/services/storageService.ts`, `shared/schema.ts`

Inventory source files: 6.

### fans

Source acceptance: **UNVERIFIED**. Inventory contains 3 UI page files, 3 route/worker source files, 28 declared handlers, and 2 unresolved declarations.

UI pages:
- `client/src/pages/FanHub.tsx` — UI API references: `/api/fan-hub/deliveries/${msg.id}/resume`, `/api/fan-hub/message`, `/api/fan-hub/messages`, `/api/fan-hub/stats`, `/api/fan-hub/subscribers`, `/api/fan-hub/subscribers/${fan.id}/consent-request`, `/api/fan-hub/subscribers/${id}`, `/api/fan-hub/subscribers/${id}/tag`, `/api/fan-hub/subscribers/import`
- `client/src/pages/FanMemberships.tsx` — UI API references: `/api/fan-memberships/members`, `/api/fan-memberships/revenue`, `/api/fan-memberships/tiers`, `/api/fan-memberships/tiers/${id}`, `/api/fan-memberships/wallet-config`, `/api/fan-memberships/wallet-leaderboard`
- `client/src/pages/analytics/AudienceInsights.tsx` — UI API references: `/api/analytics/audience`, `/api/analytics/dashboard?range=${timeRange}`

Server route and worker actions:

- `server/routes/fanCampaigns.ts` (mounted at `/api/fan-campaigns`) — 7 declared action(s).
  - `GET /api/fan-campaigns/`
  - `GET /api/fan-campaigns/stats`
  - `POST /api/fan-campaigns/`
  - `GET /api/fan-campaigns/:id`
  - `PUT /api/fan-campaigns/:id`
  - `POST /api/fan-campaigns/:id/send`
  - `DELETE /api/fan-campaigns/:id`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/lib/queryCache.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/pagination.ts`, `server/middleware/requestValidation.ts`, `server/services/fanDeliveryService.ts`

- `server/routes/fanHub.ts` (mounted at `/api/fan-hub`) — 12 declared action(s).
  - `POST /api/fan-hub/subscribers/:id/consent-request`
  - `GET /api/fan-hub/deliveries/:id`
  - `POST /api/fan-hub/deliveries/:id/resume`
  - `GET /api/fan-hub/subscribers`
  - `POST /api/fan-hub/subscribers`
  - `PUT /api/fan-hub/subscribers/:id`
  - `DELETE /api/fan-hub/subscribers/:id`
  - `POST /api/fan-hub/subscribers/import`
  - `GET /api/fan-hub/stats`
  - `POST /api/fan-hub/message`
  - `GET /api/fan-hub/messages`
  - `PUT /api/fan-hub/subscribers/:id/tag`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/requirePremium.ts`, `server/services/emailService.ts`, `server/services/fanDeliveryService.ts`, `shared/schema.ts`

- `server/routes/fanMemberships.ts` (mounted at `/api/fan-memberships`) — 9 declared action(s).
  - `GET /api/fan-memberships/tiers`
  - `POST /api/fan-memberships/tiers`
  - `PUT /api/fan-memberships/tiers/:tierId`
  - `DELETE /api/fan-memberships/tiers/:tierId`
  - `GET /api/fan-memberships/members`
  - `GET /api/fan-memberships/revenue`
  - `GET /api/fan-memberships/wallet-config`
  - `PUT /api/fan-memberships/wallet-config`
  - `GET /api/fan-memberships/wallet-leaderboard`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/requirePremium.ts`

Inventory source files: 6.

### projects

Source acceptance: **UNVERIFIED**. Inventory contains 3 UI page files, 3 route/worker source files, 26 declared handlers, and 0 unresolved declarations.

UI pages:
- `client/src/pages/MusicWorkflowAutomations.tsx` — UI API references: `/api/music-workflow-automations`, `/api/music-workflow-automations/${a.id}/enable`, `/api/music-workflow-automations/${automation.id}/config`, `/api/music-workflow-automations/${automation.id}/disable`, `/api/music-workflow-automations/${automation.id}/enable`, `/api/music-workflow-automations/logs`, `/api/music-workflow-automations/stats`, `/api/music-workflow-automations/trigger`
- `client/src/pages/Projects.tsx` — no literal API URL found; inspect imported hooks/components.
- `client/src/pages/ProjectsPageImpl.tsx` — UI API references: `/api/projects`, `/api/songwriting`, `/api/songwriting/${encodeURIComponent(id)}`, `/api/songwriting/ai-assist`, `/api/studio/projects`, `/api/studio/projects/${encodeURIComponent(id)}`, `/api/studio/projects/${encodeURIComponent(projectId)}`, `/api/studio/projects/${encodeURIComponent(projectId)}/duplicate`, `/api/studio/start-hub/summary`

Server route and worker actions:

- `server/routes/customWorkflows.ts` (mounted at `/api/custom-workflows`) — 9 declared action(s).
  - `GET /api/custom-workflows/catalog`
  - `GET /api/custom-workflows/`
  - `GET /api/custom-workflows/:id`
  - `POST /api/custom-workflows/`
  - `PUT /api/custom-workflows/:id`
  - `DELETE /api/custom-workflows/:id`
  - `POST /api/custom-workflows/:id/enable`
  - `POST /api/custom-workflows/:id/disable`
  - `POST /api/custom-workflows/:id/test`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/pagination.ts`, `server/services/notificationService.ts`, `server/services/webhookDestination.ts`

- `server/routes/musicWorkflowAutomations.ts` (mounted at `/api/music-workflow-automations`) — 8 declared action(s).
  - `GET /api/music-workflow-automations/templates`
  - `GET /api/music-workflow-automations/`
  - `POST /api/music-workflow-automations/:templateId/enable`
  - `POST /api/music-workflow-automations/:templateId/disable`
  - `PUT /api/music-workflow-automations/:templateId/config`
  - `POST /api/music-workflow-automations/trigger`
  - `GET /api/music-workflow-automations/stats`
  - `GET /api/music-workflow-automations/logs`
  - Local service/schema/storage dependencies: `server/logger.ts`, `server/middleware/auth.ts`, `server/services/musicWorkflowAutomationService.ts`, `server/services/workflowCapabilities.ts`

- `server/routes/projectBudgets.ts` (mounted at `/api/project-budgets`) — 9 declared action(s).
  - `GET /api/project-budgets/`
  - `GET /api/project-budgets/:id`
  - `GET /api/project-budgets/:id/items`
  - `POST /api/project-budgets/`
  - `PUT /api/project-budgets/:id`
  - `DELETE /api/project-budgets/:id`
  - `POST /api/project-budgets/:id/items`
  - `PUT /api/project-budgets/items/:id`
  - `DELETE /api/project-budgets/items/:id`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/pagination.ts`

Inventory source files: 6.

### studio

Source acceptance: **UNVERIFIED**. Inventory contains 1 UI page files, 28 route/worker source files, 227 declared handlers, and 0 unresolved declarations.

UI pages:
- `client/src/pages/Studio.tsx` — no literal API URL found; inspect imported hooks/components.

Server route and worker actions:

- `external/maxcore/artifacts/ai-training-server/ai_model/audio/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/audio/arrangement.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/audio/audio_analysis.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/audio/controls.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/audio/digital_gpu_synth.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/audio/finishing.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/audio/producer_tools.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/audio/track_selector.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/audio/voiceover.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/director/audio_director.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/isolated_audio.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/isolated_audio_worker.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/audio/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/audio/nodes.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/audio/spectral.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/maxbooster_veo_music/model/audio_encoder.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/workers/seed_audio_dataset.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `server/routes/admin/beatMoneyLoop.ts` (mounted at `/api/admin/beat-money-loop`) — 6 declared action(s).
  - `GET /api/admin/beat-money-loop/status`
  - `POST /api/admin/beat-money-loop/enable`
  - `POST /api/admin/beat-money-loop/disable`
  - `POST /api/admin/beat-money-loop/run-now`
  - `GET /api/admin/beat-money-loop/cycles`
  - `GET /api/admin/beat-money-loop/health-score`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/services/beatMoneyLoopService.ts`

- `server/routes/audio-processing.ts` (mounted at `/api/audio-processing`) — 8 declared action(s).
  - `POST /api/audio-processing/analyze`
  - `POST /api/audio-processing/process`
  - `GET /api/audio-processing/presets`
  - `POST /api/audio-processing/master`
  - `GET /api/audio-processing/capabilities`
  - `POST /api/audio-processing/analyze-file`
  - `GET /api/audio-processing/analysis-features`
  - `POST /api/audio-processing/transcribe`
  - Local service/schema/storage dependencies: `server/lib/aiSource.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/services/maxcoreMasteringService.ts`, `shared/ml/audio/IntelligentMasteringEngine.ts`

- `server/routes/audioAnalysis.ts` (mounted at `/api/audio-analysis`) — 6 declared action(s).
  - `POST /api/audio-analysis/analyze-metadata`
  - `POST /api/audio-analysis/analyze-loudness`
  - `POST /api/audio-analysis/generate-waveform`
  - `POST /api/audio-analysis/validate-distribution`
  - `GET /api/audio-analysis/loudness-targets`
  - `GET /api/audio-analysis/supported-formats`
  - Local service/schema/storage dependencies: `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/uploadHandler.ts`, `server/services/audioMetadataService.ts`, `server/services/audioNormalizationService.ts`, `server/services/waveformCacheService.ts`

- `server/routes/studio.ts` (mounted at `/api/studio`) — 104 declared action(s).
  - `GET /api/studio/projects`
  - `POST /api/studio/projects`
  - `POST /api/studio/projects/:projectId/duplicate`
  - `DELETE /api/studio/projects/:projectId`
  - `GET /api/studio/recent-files`
  - `GET /api/studio/samples`
  - `GET /api/studio/samples/categories`
  - `GET /api/studio/samples/:sampleId`
  - `POST /api/studio/samples/search`
  - `POST /api/studio/record/upload`
  - `GET /api/studio/projects/:projectId/mix-busses`
  - `GET /api/studio/projects/:projectId`
  - `PATCH /api/studio/projects/:projectId`
  - `POST /api/studio/projects/:projectId/save-daw-state`
  - `GET /api/studio/projects/:projectId/daw-state`
  - `POST /api/studio/projects/:projectId/sync`
  - `POST /api/studio/projects/:projectId/render`
  - `POST /api/studio/tracks`
  - `GET /api/studio/projects/:projectId/tracks`
  - `PATCH /api/studio/projects/:projectId/tracks/:trackId/effects`
  - `PATCH /api/studio/tracks/:trackId`
  - `DELETE /api/studio/tracks/:trackId`
  - `GET /api/studio/tracks/:trackId/audio-clips`
  - `POST /api/studio/projects/:projectId/tracks/:trackId/clips/upload`
  - `PATCH /api/studio/clips/:clipId`
  - `DELETE /api/studio/clips/:clipId`
  - `POST /api/studio/clips/:clipId/analyze`
  - `GET /api/studio/tracks/:trackId/automation`
  - `PUT /api/studio/tracks/:trackId/automation`
  - `POST /api/studio/mix-busses`
  - `PATCH /api/studio/mix-busses/:busId`
  - `DELETE /api/studio/mix-busses/:busId`
  - `POST /api/studio/projects/:projectId/track-routing`
  - `GET /api/studio/conversions`
  - `POST /api/studio/conversions`
  - `POST /api/studio/conversions/:conversionId/cancel`
  - `GET /api/studio/conversions/:conversionId/download`
  - `GET /api/studio/lyrics`
  - `POST /api/studio/lyrics`
  - `POST /api/studio/ai-master/:projectId`
  - `POST /api/studio/ai-mix/:projectId`
  - `GET /api/studio/ai-music/suggestions`
  - `GET /api/studio/ai-music/presets`
  - `POST /api/studio/ai-music/apply-genre-preset`
  - `POST /api/studio/ai-music/analyze-loudness`
  - `POST /api/studio/ai-music/match-reference`
  - `POST /api/studio/upload`
  - `POST /api/studio/upload-from-url`
  - `POST /api/studio/export`
  - `GET /api/studio/export/:jobId/status`
  - `GET /api/studio/export/:jobId/download`
  - `POST /api/studio/export/:jobId/upload`
  - `POST /api/studio/clips/audio`
  - `POST /api/studio/projects/:projectId/tracks/reorder`
  - `POST /api/studio/folders`
  - `GET /api/studio/projects/:projectId/folders`
  - `PATCH /api/studio/folders/:folderId`
  - `POST /api/studio/tracks/:trackId/move-to-folder`
  - `DELETE /api/studio/folders/:folderId`
  - `POST /api/studio/projects/:projectId/bulk-move-to-folder`
  - `GET /api/studio/stem-exports/:projectId`
  - `POST /api/studio/projects/:projectId/export-stems`
  - `POST /api/studio/projects/:projectId/mix-snapshots`
  - `GET /api/studio/projects/:projectId/mix-snapshots`
  - `GET /api/studio/projects/:projectId/mix-snapshots/:snapshotId`
  - `POST /api/studio/projects/:projectId/mix-snapshots/:snapshotId/recall`
  - `PATCH /api/studio/projects/:projectId/mix-snapshots/:snapshotId`
  - `DELETE /api/studio/projects/:projectId/mix-snapshots/:snapshotId`
  - `GET /api/studio/projects/:projectId/mix-snapshots/:snapshotId/compare/:compareSnapshotId`
  - `GET /api/studio/projects/:projectId/statistics`
  - `GET /api/studio/user-statistics`
  - `GET /api/studio/start-hub/summary`
  - `GET /api/studio/start-hub/recent`
  - `PATCH /api/studio/projects/:projectId/favorite`
  - `PATCH /api/studio/projects/:projectId/opened`
  - `GET /api/studio/templates`
  - `POST /api/studio/templates`
  - `POST /api/studio/projects/:projectId/save-as-template`
  - `POST /api/studio/templates/:templateId/create-project`
  - `GET /api/studio/templates/:templateId`
  - `GET /api/studio/template-categories`
  - `PATCH /api/studio/templates/:templateId`
  - `DELETE /api/studio/templates/:templateId`
  - `GET /api/studio/pinned-folders`
  - `POST /api/studio/pinned-folders`
  - `DELETE /api/studio/pinned-folders/:folderId`
  - `GET /api/studio/projects/:projectId/pool`
  - `POST /api/studio/projects/:projectId/pool`
  - `POST /api/studio/maintenance/cleanup-orphaned-uploads`
  - `GET /api/studio/maintenance/orphaned-uploads-stats`
  - `POST /api/studio/projects/:projectId/mix`
  - `POST /api/studio/projects/:projectId/master`
  - `POST /api/studio/projects/:projectId/tracks/:trackId/duplicate`
  - `POST /api/studio/projects/:projectId/tracks/:trackId/bounce`
  - `POST /api/studio/projects/:projectId/plugins/load`
  - `GET /api/studio/projects/:projectId/plugins/:pluginId/presets`
  - `POST /api/studio/projects/:projectId/plugins/:pluginId/presets/:presetId/apply`
  - `POST /api/studio/projects/:projectId/plugins/:pluginId/presets`
  - `POST /api/studio/projects/:projectId/collaboration/save`
  - `POST /api/studio/projects/:projectId/collaboration/resolve-conflict`
  - `GET /api/studio/projects/:projectId/collaboration/sync-status`
  - `GET /api/studio/projects/:projectId/history`
  - `POST /api/studio/projects/:projectId/history/undo`
  - `POST /api/studio/projects/:projectId/history/redo`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/lib/aiSource.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/uploadHandler.ts`, `server/services/audioSourceAuthorization.ts`, `server/services/audioSourceResolver.ts`, `server/services/mediaAnalyzerService.ts`, `server/services/notificationService.ts`, `server/services/projectDuplicationService.ts`, `server/services/projectOwnedDeletionCleanup.ts`

- `server/routes/studioComping.ts` (mounted at `/api/studio`) — 21 declared action(s).
  - `POST /api/studio/projects/:projectId/comping/groups`
  - `GET /api/studio/projects/:projectId/comping/groups`
  - `GET /api/studio/projects/:projectId/comping/groups/:groupId`
  - `PUT /api/studio/projects/:projectId/comping/groups/:groupId`
  - `DELETE /api/studio/projects/:projectId/comping/groups/:groupId`
  - `POST /api/studio/projects/:projectId/comping/groups/:groupId/duplicate`
  - `POST /api/studio/projects/:projectId/comping/lanes`
  - `GET /api/studio/projects/:projectId/comping/groups/:groupId/lanes`
  - `PUT /api/studio/projects/:projectId/comping/lanes/:laneId`
  - `DELETE /api/studio/projects/:projectId/comping/lanes/:laneId`
  - `PUT /api/studio/projects/:projectId/comping/groups/:groupId/lanes/reorder`
  - `POST /api/studio/projects/:projectId/comping/segments`
  - `POST /api/studio/projects/:projectId/comping/groups/:groupId/select`
  - `GET /api/studio/projects/:projectId/comping/groups/:groupId/segments`
  - `PUT /api/studio/projects/:projectId/comping/segments/:segmentId`
  - `DELETE /api/studio/projects/:projectId/comping/segments/:segmentId`
  - `POST /api/studio/projects/:projectId/comping/groups/:groupId/versions`
  - `GET /api/studio/projects/:projectId/comping/groups/:groupId/versions`
  - `PUT /api/studio/projects/:projectId/comping/groups/:groupId/versions/:versionId/activate`
  - `DELETE /api/studio/projects/:projectId/comping/versions/:versionId`
  - `POST /api/studio/projects/:projectId/comping/render`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/services/compingService.ts`

- `server/routes/studioGeneration.ts` (mounted at `/api/studio/generation`) — 13 declared action(s).
  - `POST /api/studio/generation/text`
  - `POST /api/studio/generation/audio`
  - `GET /api/studio/generation/presets`
  - `GET /api/studio/generation/pattern/instruments`
  - `GET /api/studio/generation/pattern/genres`
  - `GET /api/studio/generation/pattern/styles`
  - `GET /api/studio/generation/pattern/scales`
  - `GET /api/studio/generation/pattern/stats`
  - `POST /api/studio/generation/pattern/melody`
  - `POST /api/studio/generation/pattern/drums`
  - `POST /api/studio/generation/pattern/chords`
  - `POST /api/studio/generation/pattern/arrangement`
  - `POST /api/studio/generation/audio-to-melody`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/lib/aiSource.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/rateLimiter.ts`, `server/middleware/uploadHandler.ts`, `server/services/aiAudioGeneratorService.ts`, `server/services/maxcoreClient.ts`, `server/services/maxcoreConnector.ts`, `server/services/maxcoreControlTransport.ts`, `shared/schema.ts`

- `server/routes/studioMarkers.ts` (mounted at `/api/studio`) — 4 declared action(s).
  - `GET /api/studio/projects/:projectId/markers`
  - `POST /api/studio/projects/:projectId/markers`
  - `PATCH /api/studio/markers/:markerId`
  - `DELETE /api/studio/markers/:markerId`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`

- `server/routes/studioMidi.ts` (mounted at `/api/studio`) — 23 declared action(s).
  - `GET /api/studio/projects/:projectId/midi/clips`
  - `POST /api/studio/projects/:projectId/midi/clips`
  - `PUT /api/studio/projects/:projectId/midi/clips/:clipId`
  - `DELETE /api/studio/projects/:projectId/midi/clips/:clipId`
  - `POST /api/studio/projects/:projectId/midi/clips/:clipId/notes`
  - `PUT /api/studio/projects/:projectId/midi/clips/:clipId/notes/:noteId`
  - `DELETE /api/studio/projects/:projectId/midi/clips/:clipId/notes/:noteId`
  - `POST /api/studio/projects/:projectId/midi/clips/:clipId/quantize`
  - `POST /api/studio/generate`
  - `POST /api/studio/transform`
  - `POST /api/studio/arpeggiate`
  - `POST /api/studio/chords`
  - `POST /api/studio/ornament`
  - `POST /api/studio/strum`
  - `POST /api/studio/fit-to-scale`
  - `GET /api/studio/scales`
  - `GET /api/studio/scales/:id`
  - `GET /api/studio/tunings/:id`
  - `POST /api/studio/scale-sync`
  - `GET /api/studio/scale-sync/:projectId`
  - `DELETE /api/studio/scale-sync/:projectId`
  - `POST /api/studio/note-info`
  - `POST /api/studio/frequency`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/services/microtonalService.ts`, `server/services/midiGeneratorService.ts`, `server/services/midiTransformService.ts`

- `server/routes/studioPlugins.ts` (mounted at `/api/studio/plugins`) — 23 declared action(s).
  - `GET /api/studio/plugins/`
  - `POST /api/studio/plugins/instantiate/:id`
  - `GET /api/studio/plugins/instances`
  - `GET /api/studio/plugins/instances/:instanceId`
  - `PUT /api/studio/plugins/instances/:instanceId`
  - `DELETE /api/studio/plugins/instances/:instanceId`
  - `POST /api/studio/plugins/instances/:instanceId/render`
  - `POST /api/studio/plugins/instances/:instanceId/apply-preset`
  - `GET /api/studio/plugins/presets`
  - `POST /api/studio/plugins/presets`
  - `GET /api/studio/plugins/presets/:presetId`
  - `DELETE /api/studio/plugins/presets/:presetId`
  - `GET /api/studio/plugins/factory-presets/:id`
  - `GET /api/studio/plugins/device/ab-compare/:instanceId`
  - `POST /api/studio/plugins/device/ab-compare`
  - `POST /api/studio/plugins/device/ab-compare/:instanceId/switch`
  - `POST /api/studio/plugins/device/ab-compare/:instanceId/copy`
  - `POST /api/studio/plugins/bounce`
  - `GET /api/studio/plugins/bounce/:projectId`
  - `GET /api/studio/plugins/modulation-matrix/:projectId`
  - `POST /api/studio/plugins/modulation-matrix`
  - `DELETE /api/studio/plugins/modulation-matrix/:projectId/:routingId`
  - `GET /api/studio/plugins/:id`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/services/modulationRoutingRepository.ts`, `server/services/pluginHostService.ts`

- `server/routes/studioStems.ts` (mounted at `/api/studio`) — 7 declared action(s).
  - `POST /api/studio/projects/:projectId/stems/export`
  - `GET /api/studio/projects/:projectId/stems/status/:exportId`
  - `GET /api/studio/projects/:projectId/stems/download/:exportId`
  - `GET /api/studio/projects/:projectId/stems/list`
  - `DELETE /api/studio/projects/:projectId/stems/:exportId`
  - `POST /api/studio/projects/:projectId/stems/:exportId/cancel`
  - `GET /api/studio/projects/:projectId/stems/formats`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/services/notificationService.ts`, `server/services/stemExportService.ts`, `server/services/storageService.ts`

- `server/routes/studioWarping.ts` (mounted at `/api/studio/warping`) — 12 declared action(s).
  - `POST /api/studio/warping/clips/ensure`
  - `GET /api/studio/warping/clips/:clipId/warp/markers`
  - `POST /api/studio/warping/clips/:clipId/warp/markers`
  - `POST /api/studio/warping/clips/:clipId/warp/markers/bulk`
  - `PUT /api/studio/warping/clips/:clipId/warp/markers/:markerId`
  - `DELETE /api/studio/warping/clips/:clipId/warp/markers/:markerId`
  - `DELETE /api/studio/warping/clips/:clipId/warp/markers`
  - `POST /api/studio/warping/clips/:clipId/warp/preview`
  - `POST /api/studio/warping/clips/:clipId/warp/commit`
  - `GET /api/studio/warping/clips/:clipId/warp/transients`
  - `POST /api/studio/warping/clips/:clipId/warp/quantize`
  - `GET /api/studio/warping/clips/:clipId/warp/tempo`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/services/audioSourceResolver.ts`, `server/services/storageService.ts`, `server/services/timeStretchService.ts`

Inventory source files: 29.

### distribution

Source acceptance: **UNVERIFIED**. Inventory contains 3 UI page files, 8 route/worker source files, 174 declared handlers, and 1 unresolved declarations.

UI pages:
- `client/src/pages/Distribution.tsx` — UI API references: `/api/analytics/dashboard`, `/api/distribution/analytics/growth`, `/api/distribution/codes/isrc`, `/api/distribution/codes/upc`, `/api/distribution/earnings/breakdown`, `/api/distribution/earnings/summary`, `/api/distribution/export-report`, `/api/distribution/geographic`, `/api/distribution/hyperfollow`, `/api/distribution/hyperfollow/analytics`, `/api/distribution/payout-history`, `/api/distribution/platform-earnings`, `/api/distribution/platform/apple`, `/api/distribution/platform/spotify`, `/api/distribution/platform/youtube`, `/api/distribution/platforms`, `/api/distribution/releases`, `/api/distribution/releases/${id}`, `/api/distribution/streaming-trends`, `/api/distribution/toolost/connect`, `/api/distribution/toolost/status`, `/api/distribution/upload`, `/api/label-submissions`, `/api/label-submissions/${id}`, `/api/label-submissions/stats`, `/api/music-videos`, `/api/playlist-pitching`, `/api/playlist-pitching/stats`, `/api/sample-clearances`, `/api/sample-clearances/${id}`, `/api/sample-clearances/stats`, `/api/shows`, `/api/shows/stats`, `/api/social/generate-music-video`, `/api/social/voice-profiles`, `/api/sync-licensing`, `/api/sync-licensing/stats`, `/api/venues`, `/api/venues/stats`
- `client/src/pages/Publishing.tsx` — UI API references: `/api/publishing`, `/api/publishing/${id}`, `/api/publishing/stats`
- `client/src/pages/ReleaseCountdown.tsx` — UI API references: `/api/countdowns`, `/api/countdowns/${releaseId}/tasks/${taskId}`, `/api/countdowns/${selectedRelease?.id}`

Server route and worker actions:

- `external/maxcore/artifacts/ai-training-server/ai_model/agents/distribution_agent.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/generation/release.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/model/checkpoint_release.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `server/routes/distribution-release-schemas.ts` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `server/routes/distribution-toolost-submission.ts` (no mount found in the route registry or direct-mount list) — 0 declared action(s).
  - Local service/schema/storage dependencies: `server/services/distributionSubmissionRepository.ts`, `server/services/toolost-service.ts`

- `server/routes/distribution.ts` (mounted at `/api/distribution`) — 158 declared action(s).
  - `GET /api/distribution/toolost/connect`
  - `GET /api/distribution/toolost/callback`
  - `GET /api/distribution/toolost/status`
  - `GET /api/distribution/releases`
  - `POST /api/distribution/releases`
  - `GET /api/distribution/releases/:id`
  - `PATCH /api/distribution/releases/:id`
  - `POST /api/distribution/releases/:id/artwork`
  - `DELETE /api/distribution/releases/:id`
  - `POST /api/distribution/releases/:id/tracks`
  - `PATCH /api/distribution/releases/:releaseId/tracks/:trackId`
  - `DELETE /api/distribution/releases/:releaseId/tracks/:trackId`
  - `POST /api/distribution/codes/isrc`
  - `POST /api/distribution/codes/upc`
  - `POST /api/distribution/codes/validate`
  - `GET /api/distribution/platforms`
  - `POST /api/distribution/platforms/verify`
  - `GET /api/distribution/platforms/status`
  - `POST /api/distribution/releases/:id/schedule`
  - `POST /api/distribution/hyperfollow`
  - `GET /api/distribution/hyperfollow`
  - `GET /api/distribution/hyperfollow/analytics`
  - `GET /api/distribution/hyperfollow/:slug`
  - `PATCH /api/distribution/hyperfollow/:id`
  - `DELETE /api/distribution/hyperfollow/:id`
  - `POST /api/distribution/hyperfollow/:slug/track`
  - `GET /api/distribution/releases/:id/status`
  - `POST /api/distribution/releases/:id/check-status`
  - `POST /api/distribution/releases/:id/ddex/preview`
  - `GET /api/distribution/releases/:id/ddex/download`
  - `POST /api/distribution/releases/:id/submit`
  - `POST /api/distribution/releases/:id/takedown`
  - `GET /api/distribution/releases/:id/takedown-status`
  - `GET /api/distribution/releases/:id/analytics`
  - `GET /api/distribution/:id/streams-revenue`
  - `POST /api/distribution/validate`
  - `POST /api/distribution/generate-codes`
  - `POST /api/distribution/validate-code`
  - `POST /api/distribution/lint`
  - `GET /api/distribution/policies/:dsp`
  - `GET /api/distribution/policies`
  - `POST /api/distribution/workflow/takedown`
  - `POST /api/distribution/workflow/update`
  - `GET /api/distribution/workflow/:releaseId/history`
  - `GET /api/distribution/workflow/takedown-reasons`
  - `POST /api/distribution/fingerprint/check`
  - `POST /api/distribution/fingerprint/generate`
  - `GET /api/distribution/fingerprint/:trackId/similar`
  - `GET /api/distribution/fingerprint/stats`
  - `GET /api/distribution/country-codes`
  - `POST /api/distribution/register-codes`
  - `POST /api/distribution/catalog/import`
  - `GET /api/distribution/catalog/jobs`
  - `GET /api/distribution/catalog/jobs/:jobId`
  - `GET /api/distribution/catalog/template`
  - `GET /api/distribution/catalog/formats`
  - `POST /api/distribution/schedule`
  - `GET /api/distribution/schedule/upcoming`
  - `GET /api/distribution/schedule/countdown/:releaseId`
  - `GET /api/distribution/schedule/platforms`
  - `GET /api/distribution/schedule/optimal`
  - `POST /api/distribution/schedule/validate`
  - `GET /api/distribution/schedule/lead-time`
  - `GET /api/distribution/schedule/timezones`
  - `POST /api/distribution/presave`
  - `POST /api/distribution/identifiers/upc/generate`
  - `POST /api/distribution/identifiers/upc/validate`
  - `POST /api/distribution/identifiers/isrc/generate`
  - `POST /api/distribution/identifiers/isrc/validate`
  - `POST /api/distribution/identifiers/isrc/batch`
  - `GET /api/distribution/identifiers/country-codes`
  - `GET /api/distribution/identifiers/genres`
  - `POST /api/distribution/workflow/transition`
  - `GET /api/distribution/workflow/history/:releaseId`
  - `GET /api/distribution/workflow/versions/:releaseId`
  - `GET /api/distribution/workflow/transitions/:status`
  - `GET /api/distribution/analytics/growth`
  - `GET /api/distribution/streaming-trends`
  - `GET /api/distribution/geographic`
  - `GET /api/distribution/earnings/breakdown`
  - `GET /api/distribution/platform-earnings`
  - `GET /api/distribution/payout-history`
  - `GET /api/distribution/claims`
  - `GET /api/distribution/disputes`
  - `GET /api/distribution/qc`
  - `GET /api/distribution/qc/:releaseId`
  - `GET /api/distribution/takedowns`
  - `POST /api/distribution/takedowns`
  - `POST /api/distribution/disputes`
  - `POST /api/distribution/takedowns/:id/cancel`
  - `GET /api/distribution/reinstatements`
  - `POST /api/distribution/reinstatements`
  - `POST /api/distribution/upload`
  - `POST /api/distribution/export-report`
  - `GET /api/distribution/codes/stats`
  - `GET /api/distribution/codes/isrc`
  - `GET /api/distribution/codes/upc`
  - `POST /api/distribution/codes/:id/assign`
  - `POST /api/distribution/codes/:id/revoke`
  - `GET /api/distribution/earnings/entries`
  - `GET /api/distribution/earnings/payouts`
  - `GET /api/distribution/earnings/statements`
  - `GET /api/distribution/earnings/statements/:id/download`
  - `POST /api/distribution/earnings/statements/:id/reconcile`
  - `GET /api/distribution/earnings/summary`
  - `GET /api/distribution/earnings/territories`
  - `GET /api/distribution/royalties/currency-rates`
  - `GET /api/distribution/royalties/discrepancies`
  - `POST /api/distribution/royalties/discrepancies/:discrepancyId/dispute`
  - `GET /api/distribution/royalties/payouts`
  - `GET /api/distribution/royalties/platforms`
  - `GET /api/distribution/royalties/splits`
  - `GET /api/distribution/royalties/tax-documents`
  - `GET /api/distribution/transfer/distributors`
  - `GET /api/distribution/transfer/platforms`
  - `POST /api/distribution/transfer/validate`
  - `POST /api/distribution/transfer/import`
  - `GET /api/distribution/transfer/jobs`
  - `GET /api/distribution/transfer/jobs/:id`
  - `POST /api/distribution/profiles/link`
  - `GET /api/distribution/profiles`
  - `POST /api/distribution/profiles/:platformId/sync`
  - `DELETE /api/distribution/profiles/:platformId`
  - `POST /api/distribution/profiles/:platformId/scan-releases`
  - `POST /api/distribution/profiles/:platformId/import-catalog`
  - `POST /api/distribution/profiles/sync-all`
  - `POST /api/distribution/profiles/auto-sync/start`
  - `POST /api/distribution/profiles/auto-sync/stop`
  - `GET /api/distribution/profiles/auto-sync/status`
  - `GET /api/distribution/profiles/sync-history`
  - `GET /api/distribution/migration/report`
  - `GET /api/distribution/releases/:id/submission-status`
  - `POST /api/distribution/releases/:id/retry`
  - `GET /api/distribution/releases/:id/content-id`
  - `POST /api/distribution/content-id/generate`
  - `POST /api/distribution/content-id/generate-all`
  - `POST /api/distribution/content-id/register`
  - `POST /api/distribution/content-id/resolve`
  - `GET /api/distribution/releases/:id/outcomes`
  - `POST /api/distribution/releases/:id/retry-outcome`
  - `POST /api/distribution/isrc/generate`
  - `POST /api/distribution/upc/generate`
  - `POST /api/distribution/qc/analyze`
  - `POST /api/distribution/qc/fix`
  - `POST /api/distribution/earnings/import`
  - `POST /api/distribution/earnings/payout`
  - `POST /api/distribution/codes/generate`
  - `POST /api/distribution/royalties/payout`
  - `POST /api/distribution/royalties/tax-document`
  - `POST /api/distribution/artwork/upload`
  - `GET /api/distribution/packages/:projectId`
  - `POST /api/distribution/packages`
  - `PUT /api/distribution/packages/:id`
  - `GET /api/distribution/packages/:id/tracks`
  - `POST /api/distribution/packages/:id/tracks`
  - `GET /api/distribution/packages/:id/export`
  - `GET /api/distribution/submission/:releaseId`
  - `POST /api/distribution/catalog-export`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/uploadHandler.ts`, `server/routes/distribution-release-schemas.ts`, `server/routes/distribution-toolost-submission.ts`, `server/services/audioFingerprint.ts`, `server/services/audioMetadataService.ts`, `server/services/catalogImporter.ts`, `server/services/ddexPackageService.ts`, `server/services/distributionCodeGenerationService.ts`, `server/services/distributionDataTransferService.ts`, `server/services/distributionSubmissionRepository.ts`, `server/services/dspPolicyChecker.ts`, `server/services/identifierService.ts`, `server/services/labelCopyLinter.ts`, `server/services/labelgrid-service.ts`, `server/services/musicCodes.ts`, `server/services/notificationService.ts`, `server/services/releaseScheduler.ts`, `server/services/releaseWorkflow.ts`, `server/services/releaseWorkflowService.ts`, `server/services/storageService.ts`, `server/services/toolost-service.ts`, `server/services/toolostEnvironment.ts`, `server/services/toolostRuntimeConfig.ts`, `server/storage`

- `server/routes/publishing.ts` (mounted at `/api/publishing`) — 6 declared action(s).
  - `GET /api/publishing/`
  - `POST /api/publishing/`
  - `PUT /api/publishing/:id`
  - `DELETE /api/publishing/:id`
  - `GET /api/publishing/stats`
  - `GET /api/publishing/:id`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/requirePremium.ts`

- `server/routes/releaseCountdown.ts` (mounted at `/api/countdowns`) — 10 declared action(s).
  - `GET /api/countdowns/`
  - `POST /api/countdowns/`
  - `GET /api/countdowns/:id`
  - `PATCH /api/countdowns/:id`
  - `POST /api/countdowns/:id/tasks`
  - `GET /api/countdowns/:id/tasks`
  - `PATCH /api/countdowns/:id/tasks/:taskId`
  - `GET /api/countdowns/:id/analytics`
  - `POST /api/countdowns/:id/analytics/track`
  - `POST /api/countdowns/:id/generate-checklist`
  - Local service/schema/storage dependencies: `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/errorHandler.ts`, `server/services/releaseCountdownService.ts`

Inventory source files: 11.

### marketing

Source acceptance: **UNVERIFIED**. Inventory contains 6 UI page files, 17 route/worker source files, 233 declared handlers, and 0 unresolved declarations.

UI pages:
- `client/src/pages/Advertisement.tsx` — UI API references: `/api/advertising/ai-insights`, `/api/advertising/audience-segments`, `/api/advertising/campaigns`, `/api/advertising/campaigns/${id}`, `/api/advertising/campaigns/${id}/activate`, `/api/advertising/competitor-insights`, `/api/advertising/creative-fatigue`, `/api/advertising/creatives`, `/api/advertising/creatives/${creativeId}`, `/api/advertising/forecasts`, `/api/advertising/generate-campaign`, `/api/advertising/generate-image`, `/api/advertising/generate-video`, `/api/advertising/lookalike-audiences`, `/api/advertising/lookalike-audiences/${audienceId}`, `/api/advertising/upload-image`, `/api/organic/metrics`, `/api/organic/recommendations`, `/api/press-kit`, `/api/social/platform-status`, `/api/social/promotable-content?type=${contentType}`, `/api/storage/upload`
- `client/src/pages/OutreachCRM.tsx` — UI API references: `/api/outreach/campaigns`, `/api/outreach/campaigns/${selectedCampaign!.id}/pitches`, `/api/outreach/follow-ups`, `/api/outreach/generate-pitch`, `/api/outreach/pitches/${id}`
- `client/src/pages/PlaylistPitching.tsx` — UI API references: `/api/playlist-pitching`, `/api/playlist-pitching/${id}`, `/api/playlist-pitching/${id}/status`, `/api/playlist-pitching/curators`, `/api/playlist-pitching/stats`
- `client/src/pages/SocialMedia.tsx` — UI API references: `/api/fan-campaigns`, `/api/fan-campaigns/${id}`, `/api/fan-campaigns/${id}/send`, `/api/fan-campaigns/stats`, `/api/multimodal/generate`, `/api/press-kit`, `/api/radio-pitches`, `/api/radio-pitches/${id}`, `/api/radio-pitches/stats`, `/api/social/activity`, `/api/social/ai-insights`, `/api/social/calendar`, `/api/social/calendar/${postId}`, `/api/social/calendar/${postId}/publish`, `/api/social/calendar/batch`, `/api/social/calendar/batch/publish`, `/api/social/calendar/stats`, `/api/social/connect/${providerId}`, `/api/social/connections`, `/api/social/disconnect/${providerId}`, `/api/social/generate-content`, `/api/social/generate-from-url`, `/api/social/generate-image`, `/api/social/metrics`, `/api/social/platform-status`, `/api/social/posts`, `/api/social/posts/${postId}`, `/api/social/schedule-post`, `/api/social/weekly-stats`, `/api/storage/upload`, `tab below), which has its own status query and
  // configure/start/stop mutations against the same /api/autopilot/* routes.

  // Handler Functions
  const handleConnectPlatform = async (platformId: string) => {
    try {
      // Cards use display ids; OAuth routes use provider ids.
      const providerId = socialPlatformConnectId(platformId);
      const response = await apiRequest(`
- `client/src/pages/analytics/PlaylistJourneysVisualization.tsx` — UI API references: `/api/analytics/playlist-journeys`, `/api/analytics/playlist-journeys?range=${encodeURIComponent(timeFilter)}`
- `client/src/pages/analytics/PlaylistTracking.tsx` — UI API references: `/api/analytics/dashboard`, `/api/analytics/dashboard?range=${selectedTimeRange}`

Server route and worker actions:

- `external/maxcore/artifacts/ai-training-server/ai_model/director/campaign.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/director/social_director.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/generation/campaign.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/generation/social_controls.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/maxbooster_veo_music/pipeline/campaign_generator.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `server/routes/advertising.ts` (mounted at `/api/advertising`) — 37 declared action(s).
  - `GET /api/advertising/campaigns`
  - `GET /api/advertising/ai-insights`
  - `GET /api/advertising/audience-segments`
  - `GET /api/advertising/creative-fatigue`
  - `PATCH /api/advertising/creatives/:creativeId`
  - `GET /api/advertising/bidding-strategies`
  - `GET /api/advertising/lookalike-audiences`
  - `POST /api/advertising/lookalike-audiences`
  - `PATCH /api/advertising/lookalike-audiences/:id`
  - `GET /api/advertising/forecasts`
  - `GET /api/advertising/competitor-insights`
  - `GET /api/advertising/ab-tests`
  - `POST /api/advertising/campaigns`
  - `POST /api/advertising/campaigns/:id/activate`
  - `PATCH /api/advertising/campaigns/:id`
  - `DELETE /api/advertising/campaigns/:id`
  - `POST /api/advertising/creatives`
  - `POST /api/advertising/upload-image`
  - `GET /api/advertising/status`
  - `POST /api/advertising/start`
  - `POST /api/advertising/stop`
  - `POST /api/advertising/configure`
  - `GET /api/advertising/variants`
  - `GET /api/advertising/attribution/channels`
  - `GET /api/advertising/attribution/paths`
  - `GET /api/advertising/dashboard/attribution`
  - `GET /api/advertising/dashboard/paths`
  - `GET /api/advertising/roas/audience-segments`
  - `GET /api/advertising/roas/campaigns`
  - `GET /api/advertising/roas/creative-fatigue-analysis`
  - `GET /api/advertising/roas/forecast`
  - `POST /api/advertising/optimize-campaign`
  - `POST /api/advertising/generate-content`
  - `POST /api/advertising/generate-campaign`
  - `POST /api/advertising/generate-video`
  - `POST /api/advertising/generate-image`
  - `GET /api/advertising/video-templates`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/lib/aiSource.ts`, `server/lib/maxcoreOwnerContext.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/uploadHandler.ts`, `server/services/advancedVideoRendererService.ts`, `server/services/advertisingDispatchService.ts`, `server/services/aiModelManager.ts`, `server/services/generatedImageAsset.ts`, `server/services/maxcoreClient.ts`, `server/services/maxcoreConnector.ts`, `server/services/maxcoreControlTransport.ts`, `server/services/maxcoreDomainAdapter.ts`, `server/services/notificationService.ts`, `server/services/promotableContentService.ts`, `server/services/pythonAIService.ts`, `server/services/storageService.ts`, `server/storage`

- `server/routes/advertisingAutopilot.ts` (mounted at `/api/advertising/autopilot`) — 31 declared action(s).
  - `GET /api/advertising/autopilot/status`
  - `POST /api/advertising/autopilot/start`
  - `POST /api/advertising/autopilot/stop`
  - `POST /api/advertising/autopilot/configure`
  - `POST /api/advertising/autopilot/recommend`
  - `GET /api/advertising/autopilot/performance`
  - `GET /api/advertising/autopilot/campaigns`
  - `GET /api/advertising/autopilot/ai-insights`
  - `GET /api/advertising/autopilot/audience-segments`
  - `GET /api/advertising/autopilot/creative-fatigue`
  - `GET /api/advertising/autopilot/bidding-strategies`
  - `GET /api/advertising/autopilot/lookalike-audiences`
  - `GET /api/advertising/autopilot/forecasts`
  - `GET /api/advertising/autopilot/competitor-insights`
  - `GET /api/advertising/autopilot/ab-tests`
  - `GET /api/advertising/autopilot/creative-variants`
  - `GET /api/advertising/autopilot/roas/campaigns`
  - `GET /api/advertising/autopilot/roas/audience-segments`
  - `GET /api/advertising/autopilot/roas/forecast`
  - `GET /api/advertising/autopilot/roas/budget-optimization`
  - `GET /api/advertising/autopilot/roas/creative-fatigue-analysis`
  - `GET /api/advertising/autopilot/budget-pacing/campaigns`
  - `GET /api/advertising/autopilot/budget-pacing/history`
  - `GET /api/advertising/autopilot/attribution`
  - `GET /api/advertising/autopilot/cross-channel-attribution`
  - `GET /api/advertising/autopilot/social-listening/keywords`
  - `GET /api/advertising/autopilot/social-listening/trending`
  - `GET /api/advertising/autopilot/social-listening/influencers`
  - `GET /api/advertising/autopilot/social-listening/alerts`
  - `GET /api/advertising/autopilot/competitors`
  - `GET /api/advertising/autopilot/your-stats`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/services/aiModelManager.ts`, `server/storage`

- `server/routes/autonomousSocial.ts` (mounted at `/api/auto/social`) — 3 declared action(s).
  - `GET /api/auto/social/status`
  - `POST /api/auto/social/start`
  - `POST /api/auto/social/stop`
  - Local service/schema/storage dependencies: `server/logger.ts`, `server/middleware/auth.ts`

- `server/routes/fanCampaigns.ts` (mounted at `/api/fan-campaigns`) — 7 declared action(s).
  - `GET /api/fan-campaigns/`
  - `GET /api/fan-campaigns/stats`
  - `POST /api/fan-campaigns/`
  - `GET /api/fan-campaigns/:id`
  - `PUT /api/fan-campaigns/:id`
  - `POST /api/fan-campaigns/:id/send`
  - `DELETE /api/fan-campaigns/:id`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/lib/queryCache.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/pagination.ts`, `server/middleware/requestValidation.ts`, `server/services/fanDeliveryService.ts`

- `server/routes/outreach.ts` (mounted at `/api/outreach`) — 8 declared action(s).
  - `GET /api/outreach/campaigns`
  - `POST /api/outreach/campaigns`
  - `DELETE /api/outreach/campaigns/:id`
  - `GET /api/outreach/campaigns/:campaignId/pitches`
  - `POST /api/outreach/campaigns/:campaignId/pitches`
  - `PATCH /api/outreach/pitches/:pitchId`
  - `POST /api/outreach/generate-pitch`
  - `GET /api/outreach/follow-ups`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/services/awarenessContext.ts`, `server/services/maxcoreClient.ts`

- `server/routes/playlistPitching.ts` (mounted at `/api/playlist-pitching`) — 8 declared action(s).
  - `GET /api/playlist-pitching/curators`
  - `GET /api/playlist-pitching/`
  - `POST /api/playlist-pitching/`
  - `PUT /api/playlist-pitching/:id`
  - `PATCH /api/playlist-pitching/:id/status`
  - `DELETE /api/playlist-pitching/:id`
  - `GET /api/playlist-pitching/stats`
  - `GET /api/playlist-pitching/:id`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/lib/queryCache.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/pagination.ts`, `server/middleware/requirePremium.ts`

- `server/routes/socialAI.ts` (mounted at `/api/social`) — 33 declared action(s).
  - `POST /api/social/chatbot/respond`
  - `POST /api/social/chatbot/train`
  - `GET /api/social/chatbot/stats`
  - `GET /api/social/chatbot/templates`
  - `POST /api/social/chatbot/templates`
  - `POST /api/social/chatbot/route`
  - `GET /api/social/listening/mentions`
  - `GET /api/social/listening/sentiment`
  - `GET /api/social/listening/trends`
  - `GET /api/social/listening/competitors`
  - `GET /api/social/listening/brand-health`
  - `GET /api/social/listening/share-of-voice`
  - `GET /api/social/listening/queries`
  - `POST /api/social/listening/queries`
  - `DELETE /api/social/listening/queries/:id`
  - `POST /api/social/strategy/recommend`
  - `POST /api/social/strategy/campaign`
  - `POST /api/social/strategy/plan`
  - `GET /api/social/strategy/content-strategy`
  - `GET /api/social/strategy/posting-times`
  - `GET /api/social/strategy/growth-predictions`
  - `GET /api/social/strategy/tips`
  - `GET /api/social/strategy/insights`
  - `GET /api/social/benchmarks`
  - `GET /api/social/ai-content/ab-variants`
  - `POST /api/social/ai-content/ab-variants`
  - `POST /api/social/ai-content/analyze-brand-voice`
  - `POST /api/social/ai-content/multilingual`
  - `POST /api/social/ai-content/optimize-hashtags`
  - `GET /api/social/ai-content/posting-times`
  - `GET /api/social/ai-content/trending-topics`
  - `GET /api/social/generate/context`
  - `POST /api/social/generate`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/lib/aiSource.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/rateLimiter.ts`, `server/services/aiContentService.ts`, `server/services/awarenessContext.ts`, `server/services/maxcoreClient.ts`, `server/services/mediaAnalyzerService.ts`, `server/services/socialChatbotService.ts`, `server/services/socialListeningService.ts`, `server/services/socialStrategyAIService.ts`, `server/services/unifiedAIController.ts`

- `server/routes/socialApprovals.ts` (mounted at `/api/social/approvals`) — 11 declared action(s).
  - `GET /api/social/approvals/`
  - `GET /api/social/approvals/pending`
  - `POST /api/social/approvals/:postId/submit`
  - `POST /api/social/approvals/:postId/approve`
  - `POST /api/social/approvals/:postId/reject`
  - `POST /api/social/approvals/:postId/schedule`
  - `POST /api/social/approvals/:postId/publish`
  - `GET /api/social/approvals/history/:postId`
  - `GET /api/social/approvals/my-posts`
  - `GET /api/social/approvals/stats`
  - `GET /api/social/approvals/history`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/services/approvalService.ts`

- `server/routes/socialBulk.ts` (mounted at `/api/social/bulk`) — 6 declared action(s).
  - `POST /api/social/bulk/validate`
  - `POST /api/social/bulk/schedule`
  - `GET /api/social/bulk/status/:batchId`
  - `DELETE /api/social/bulk/:batchId`
  - `GET /api/social/bulk/batches`
  - `GET /api/social/bulk/status`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/services/socialQueueService.ts`

- `server/routes/socialMedia.ts` (mounted at `/api/social`) — 83 declared action(s).
  - `GET /api/social/posts`
  - `DELETE /api/social/posts/:postId`
  - `POST /api/social/schedule-post`
  - `POST /api/social/calendar/batch/publish`
  - `POST /api/social/calendar/:postId/publish`
  - `GET /api/social/metrics`
  - `GET /api/social/calendar`
  - `GET /api/social/calendar/stats`
  - `POST /api/social/calendar`
  - `PUT /api/social/calendar/:postId`
  - `PATCH /api/social/calendar/batch`
  - `DELETE /api/social/calendar/batch`
  - `DELETE /api/social/calendar/:postId`
  - `GET /api/social/activity`
  - `GET /api/social/weekly-stats`
  - `GET /api/social/ai-insights`
  - `GET /api/social/platform-status`
  - `POST /api/social/sync-all`
  - `GET /api/social/listening/keywords`
  - `GET /api/social/hashtags/trending`
  - `GET /api/social/listening/trending`
  - `GET /api/social/listening/influencers`
  - `GET /api/social/listening/alerts`
  - `GET /api/social/competitors`
  - `POST /api/social/competitors`
  - `DELETE /api/social/competitors/:id`
  - `GET /api/social/your-stats`
  - `GET /api/social/benchmark/competitors`
  - `GET /api/social/benchmark/insights`
  - `GET /api/social/benchmark/share-of-voice`
  - `GET /api/social/inbox`
  - `POST /api/social/inbox/sync`
  - `GET /api/social/inbox/stats`
  - `POST /api/social/inbox/bulk/read`
  - `POST /api/social/inbox/bulk/unread`
  - `POST /api/social/inbox/bulk/archive`
  - `POST /api/social/inbox/bulk/delete`
  - `POST /api/social/inbox/:id/read`
  - `POST /api/social/inbox/:id/reply`
  - `POST /api/social/inbox/:id/assign`
  - `POST /api/social/inbox/:id/archive`
  - `GET /api/social/inbox/templates`
  - `POST /api/social/inbox/templates`
  - `DELETE /api/social/inbox/templates/:id`
  - `GET /api/social/inbox/team`
  - `GET /api/social/connections`
  - `GET /api/social/unified-calendar/posts`
  - `GET /api/social/unified-calendar/campaigns`
  - `GET /api/social/unified-calendar/holidays`
  - `GET /api/social/unified-calendar/queue`
  - `POST /api/social/generate-content-legacy`
  - `POST /api/social/generate-content`
  - `POST /api/social/generate-from-url`
  - `GET /api/social/scheduled`
  - `GET /api/social/analytics`
  - `POST /api/social/generate-video`
  - `GET /api/social/video-job/:jobId`
  - `GET /api/social/video-proxy/:filename`
  - `GET /api/social/video-templates`
  - `POST /api/social/veo-campaign`
  - `POST /api/social/veo-campaign/single`
  - `GET /api/social/veo-campaign/platforms`
  - `GET /api/social/veo-campaign/goals`
  - `GET /api/social/veo-campaign/recommend/:platform`
  - `GET /api/social/veo-campaign/status`
  - `POST /api/social/veo-url/metadata`
  - `POST /api/social/veo-campaign/from-url`
  - `GET /api/social/promotable-content`
  - `POST /api/social/veo-campaign/promote`
  - `POST /api/social/veo-campaign/promote-storefront`
  - `POST /api/social/veo-campaign/promote-listing`
  - `POST /api/social/generate-image`
  - `POST /api/social/analyze-url`
  - `POST /api/social/analyze-audio`
  - `POST /api/social/analyze-image`
  - `GET /api/social/voice-profiles`
  - `POST /api/social/synthesize-voice`
  - `POST /api/social/analyze-reference-voice`
  - `POST /api/social/analyze-audio-beats`
  - `POST /api/social/beat-analyze`
  - `POST /api/social/generate-music-video`
  - `GET /api/social/music-video-job/:jobId`
  - `GET /api/social/music-video-capabilities`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/lib/aiSource.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/rateLimiter.ts`, `server/middleware/uploadHandler.ts`, `server/pocket-dimension/index.ts`, `server/routes/socialMediaJobHandlers.ts`, `server/services/advancedVideoRendererService.ts`, `server/services/autoPostingServiceV2.ts`, `server/services/awarenessContext.ts`, `server/services/contentPipeline/platformFormatters.ts`, `server/services/firstPartySocialSource.ts`, `server/services/generatedImageAsset.ts`, `server/services/maxcoreClient.ts`, `server/services/maxcoreConnector.ts`, `server/services/maxcoreControlTransport.ts`, `server/services/maxcoreDomainAdapter.ts`, `server/services/mediaAnalyzerService.ts`, `server/services/mediaUploadCleanup.ts`, `server/services/notificationService.ts`, `server/services/promotableContentService.ts`, `server/services/safeUrlFetch.ts`, `server/services/socialInboxProviderService.ts`, `server/services/socialMediaJobRepository.ts`, `server/services/socialSyncService.ts`, `server/services/socialUrlMaxCoreTransport.ts`, `server/services/storageService.ts`, `server/storage`

- `server/routes/socialMediaJobHandlers.ts` (no mount found in the route registry or direct-mount list) — 0 declared action(s).
  - Local service/schema/storage dependencies: `server/services/mediaUploadCleanup.ts`, `server/services/socialMediaJobRepository.ts`

- `server/routes/socialOAuth.ts` (mounted at `/api/social`) — 6 declared action(s).
  - `GET /api/social/platforms`
  - `POST /api/social/connect/:platform`
  - `GET /api/social/callback/:platform`
  - `POST /api/social/disconnect/:platform`
  - `POST /api/social/sync/:platform`
  - `POST /api/social/refresh/:platform`
  - Local service/schema/storage dependencies: `server/config/env.ts`, `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/services/socialCredentialCodec.ts`, `server/services/socialOAuthService.ts`, `server/services/socialOAuthState.ts`, `server/services/socialSyncService.ts`

Inventory source files: 23.

### revenue

Source acceptance: **UNVERIFIED**. Inventory contains 14 UI page files, 10 route/worker source files, 94 declared handlers, and 0 unresolved declarations.

UI pages:
- `client/src/pages/Analytics.tsx` — UI API references: `/api/analytics-alerts/alerts`, `/api/analytics-alerts/alerts/${alertId}/dismiss`, `/api/analytics-alerts/alerts/summary`, `/api/analytics-alerts/cross-platform-comparison`, `/api/analytics-alerts/playlist-changes/track`, `/api/analytics-alerts/trigger-cities`, `/api/analytics/anomalies`, `/api/analytics/anomalies/${anomalyId}/acknowledge`, `/api/analytics/anomalies/summary`, `/api/analytics/anomalies?${params.toString()}`, `/api/analytics/dashboard`, `/api/analytics/export`
- `client/src/pages/Royalties.tsx` — UI API references: `/api/auth/me`, `/api/payouts`, `/api/payouts/disputes`, `/api/payouts/disputes/${disputeId}/evidence`, `/api/payouts/disputes/${disputeId}/message`, `/api/payouts/history`, `/api/payouts/retry/${payoutId}`, `/api/payouts/statements`, `/api/payouts/statements/generate`, `/api/payouts/status/${payoutId}`, `/api/payouts/tax-form/submit`, `/api/payouts/tax-forms`, `/api/publishing`, `/api/publishing/stats`, `/api/royalties`, `/api/royalties/connect-stripe`, `/api/royalties/download-statement/${statementId}`, `/api/royalties/export`, `/api/royalties/forecast`, `/api/royalties/payment-methods`, `/api/royalties/payout-settings`, `/api/royalties/platform-breakdown`, `/api/royalties/request-payout`, `/api/royalties/splits`, `/api/royalties/splits/${id}`, `/api/royalties/splits/${splitId}`, `/api/royalties/statements`, `/api/royalties/tax-info`, `/api/royalties/top-tracks`
- `client/src/pages/analytics/AIDashboard.tsx` — UI API references: `/api/ai/analytics/insights`
- `client/src/pages/analytics/ARDiscoveryPanel.tsx` — UI API references: `/api/analytics/ar-discovery`
- `client/src/pages/analytics/AudienceInsights.tsx` — UI API references: `/api/analytics/audience`, `/api/analytics/dashboard?range=${timeRange}`
- `client/src/pages/analytics/CrossPlatformComparison.tsx` — UI API references: `/api/analytics-alerts/cross-platform-comparison`
- `client/src/pages/analytics/ExportAnalytics.tsx` — UI API references: `/api/analytics/export`
- `client/src/pages/analytics/GlobalRankingDashboard.tsx` — UI API references: `/api/analytics/global-ranking`, `/api/analytics/global-ranking?days=${encodeURIComponent(timeRange.replace(`
- `client/src/pages/analytics/HistoricalAnalyticsView.tsx` — UI API references: `/api/analytics/historical/milestones`, `/api/analytics/historical/trends`, `/api/analytics/historical/yearly`
- `client/src/pages/analytics/NaturalLanguageQuery.tsx` — UI API references: `/api/analytics/natural-language-query`
- `client/src/pages/analytics/PlaylistJourneysVisualization.tsx` — UI API references: `/api/analytics/playlist-journeys`, `/api/analytics/playlist-journeys?range=${encodeURIComponent(timeFilter)}`
- `client/src/pages/analytics/PlaylistTracking.tsx` — UI API references: `/api/analytics/dashboard`, `/api/analytics/dashboard?range=${selectedTimeRange}`
- `client/src/pages/analytics/RevenueAnalytics.tsx` — UI API references: `/api/analytics/dashboard?${params.toString()}`, `/api/analytics/revenue`
- `client/src/pages/analytics/StreamingAnalytics.tsx` — UI API references: `/api/analytics/dashboard?${params.toString()}`, `/api/analytics/streaming`

Server route and worker actions:

- `external/maxcore/artifacts/ai-training-server/ai_model/analytics.py` (no mount found in the route registry or direct-mount list) — 3 declared action(s).
  - `GET /capability`
  - `POST /predict`
  - `POST /insights`

- `external/maxcore/artifacts/ai-training-server/ai_model/director/analytics.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/training/live_learning.py` (no mount found in the route registry or direct-mount list) — 3 declared action(s).
  - `GET /api/training/candidates/live`
  - `GET /api/training/candidates/live/{run_id}`
  - `POST /api/training/candidates/live`

- `external/maxcore/artifacts/ai-training-server/ai_model/training/media_learning.py` (no mount found in the route registry or direct-mount list) — 2 declared action(s).
  - `GET /api/training/media/{modality}/preflight`
  - `POST /api/training/media/{modality}/preflight`

- `server/routes/analytics-internal.ts` (mounted at `/api/analytics`) — 18 declared action(s).
  - `POST /api/analytics/ai/predict-metric`
  - `GET /api/analytics/ai/predict-churn`
  - `GET /api/analytics/ai/forecast-revenue`
  - `GET /api/analytics/ai/detect-anomalies`
  - `GET /api/analytics/ai/insights`
  - `POST /api/analytics/music/career-growth`
  - `GET /api/analytics/music/milestones`
  - `GET /api/analytics/music/fanbase`
  - `GET /api/analytics/music/insights`
  - `GET /api/analytics/music/release-strategy`
  - `GET /api/analytics/historical/yearly`
  - `GET /api/analytics/historical/milestones`
  - `GET /api/analytics/historical/trends`
  - `GET /api/analytics/global-ranking`
  - `POST /api/analytics/natural-language-query`
  - `GET /api/analytics/playlist-journeys`
  - `GET /api/analytics/ar-discovery`
  - `POST /api/analytics/schedule-export`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/infrastructure/distributedCache.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/requirePremium.ts`

- `server/routes/api/analyticsAlerts.ts` (mounted at `/api/analytics-alerts`) — 12 declared action(s).
  - `GET /api/analytics-alerts/alerts`
  - `GET /api/analytics-alerts/alerts/summary`
  - `GET /api/analytics-alerts/alerts/unread-count`
  - `POST /api/analytics-alerts/alerts/:alertId/read`
  - `POST /api/analytics-alerts/alerts/:alertId/dismiss`
  - `GET /api/analytics-alerts/trigger-cities`
  - `GET /api/analytics-alerts/trigger-cities/cached`
  - `POST /api/analytics-alerts/playlist-changes/track`
  - `POST /api/analytics-alerts/milestones/check`
  - `GET /api/analytics-alerts/cross-platform-comparison`
  - `POST /api/analytics-alerts/growth-anomalies/detect`
  - `POST /api/analytics-alerts/viral-content/detect`
  - Local service/schema/storage dependencies: `server/logger.ts`, `server/services/analyticsAlertService.ts`

- `server/routes/api/certifiedAnalytics.ts` (mounted at `/api/certified-analytics`) — 17 declared action(s).
  - `GET /api/certified-analytics/streams{/:artistId}`
  - `GET /api/certified-analytics/playlists{/:trackId}`
  - `GET /api/certified-analytics/playlists/revenue{/:artistId}`
  - `GET /api/certified-analytics/playlists/editorial{/:artistId}`
  - `GET /api/certified-analytics/cohorts{/:artistId}`
  - `GET /api/certified-analytics/cohorts/retention{/:artistId}`
  - `GET /api/certified-analytics/cohorts/churn{/:artistId}`
  - `GET /api/certified-analytics/cohorts/loyalty{/:artistId}`
  - `GET /api/certified-analytics/forecast{/:artistId}`
  - `GET /api/certified-analytics/forecast/breakdown{/:artistId}`
  - `GET /api/certified-analytics/forecast/seasonality{/:artistId}`
  - `POST /api/certified-analytics/forecast/release-impact`
  - `GET /api/certified-analytics/demographics{/:artistId}`
  - `POST /api/certified-analytics/sync/:platform`
  - `POST /api/certified-analytics/sync-all`
  - `GET /api/certified-analytics/sync-status`
  - `GET /api/certified-analytics/overview{/:artistId}`
  - Local service/schema/storage dependencies: `server/logger.ts`, `server/services/cohortAnalyticsService.ts`, `server/services/dspAnalyticsService.ts`, `server/services/playlistAttributionService.ts`, `server/services/revenueForecaster.ts`

- `server/routes/api/v1/analytics.ts` (mounted at `/api/v1/analytics`) — 17 declared action(s).
  - `GET /api/v1/analytics/platforms`
  - `GET /api/v1/analytics/streams{/:artistId}`
  - `GET /api/v1/analytics/engagement{/:artistId}`
  - `GET /api/v1/analytics/demographics{/:artistId}`
  - `GET /api/v1/analytics/playlists{/:artistId}`
  - `GET /api/v1/analytics/tracks{/:artistId}`
  - `GET /api/v1/analytics/summary{/:artistId}`
  - `POST /api/v1/analytics/playlist-journeys`
  - `GET /api/v1/analytics/global-ranking{/:artistId}`
  - `POST /api/v1/analytics/ar-discovery`
  - `POST /api/v1/analytics/nlp-query`
  - `GET /api/v1/analytics/historical{/:artistId}`
  - `GET /api/v1/analytics/sync-impact{/:artistId}`
  - `GET /api/v1/analytics/cross-platform{/:artistId}`
  - `GET /api/v1/analytics/data-sources/shazam{/:artistId}`
  - `GET /api/v1/analytics/data-sources/radio{/:artistId}`
  - `GET /api/v1/analytics/data-sources/tour{/:artistId}`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/infrastructure/distributedCache.ts`, `server/logger.ts`, `server/services/advancedAnalyticsService.ts`, `server/services/apiKeyService.ts`

- `server/routes/autopilot-learning.ts` (mounted at `/api/autopilot/learning`) — 16 declared action(s).
  - `GET /api/autopilot/learning/status`
  - `GET /api/autopilot/learning/insights`
  - `GET /api/autopilot/learning/recommendations`
  - `GET /api/autopilot/learning/performance`
  - `POST /api/autopilot/learning/record`
  - `GET /api/autopilot/learning/optimal-times/:platform`
  - `GET /api/autopilot/learning/top-content`
  - `GET /api/autopilot/learning/patterns`
  - `GET /api/autopilot/learning/platform-stats`
  - `POST /api/autopilot/learning/generate-insights`
  - `GET /api/autopilot/learning/hyper/status`
  - `GET /api/autopilot/learning/hyper/insights`
  - `GET /api/autopilot/learning/hyper/predict/:platform`
  - `GET /api/autopilot/learning/hyper/metrics`
  - `POST /api/autopilot/learning/hyper/start`
  - `POST /api/autopilot/learning/hyper/stop`
  - Local service/schema/storage dependencies: `server/lib/redisConnectionFactory.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/services/autopilotLearningService.ts`, `server/services/maxcoreControlTransport.ts`

- `server/routes/revenueForecast.ts` (mounted at `/api/revenue-forecast`) — 6 declared action(s).
  - `GET /api/revenue-forecast/`
  - `GET /api/revenue-forecast/projections`
  - `GET /api/revenue-forecast/accuracy`
  - `GET /api/revenue-forecast/rate`
  - `POST /api/revenue-forecast/generate`
  - `DELETE /api/revenue-forecast/:id`
  - Local service/schema/storage dependencies: `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/errorHandler.ts`, `server/services/revenueForecastService.ts`

Inventory source files: 24.

### assistant

Source acceptance: **UNVERIFIED**. Inventory contains 3 UI page files, 281 route/worker source files, 313 declared handlers, and 2 unresolved declarations.

UI pages:
- `client/src/pages/Assistant.tsx` — UI API references: `/api/assistant/chat`, `/api/assistant/history`, `/api/assistant/history?before=${encodeURIComponent(oldestId)}`
- `client/src/pages/VideoGeneratorPage.tsx` — no literal API URL found; inspect imported hooks/components.
- `client/src/pages/analytics/AIDashboard.tsx` — UI API references: `/api/ai/analytics/insights`

Server route and worker actions:

- `external/maxcore/artifacts/ai-training-server/ai_model/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/adapters/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/adapters/url_adapter.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/adaptive_concurrency.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/agents/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/agents/distribution_agent.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/agents/optimization_agent.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/agents/script_agent.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/agents/visual_spec_agent.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/analytics.py` (no mount found in the route registry or direct-mount list) — 3 declared action(s).
  - `GET /capability`
  - `POST /predict`
  - `POST /insights`

- `external/maxcore/artifacts/ai-training-server/ai_model/api/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/api/schemas.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/audio/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/audio/arrangement.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/audio/audio_analysis.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/audio/controls.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/audio/digital_gpu_synth.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/audio/finishing.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/audio/producer_tools.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/audio/track_selector.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/audio/voiceover.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/awareness/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/awareness/engine.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/awareness/lease.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/awareness/sources.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/boostsheets/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/boostsheets/boostsheet.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/boostsheets/lifecycle.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/boostsheets/repository.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/boostsheets/versioning.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/capabilities.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/content_playbook.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/dedup_cache.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/director/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/director/ads_director.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/director/analytics.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/director/api.py` (no mount found in the route registry or direct-mount list) — 6 declared action(s).
  - `POST /campaign`
  - `POST /feedback`
  - `GET /platforms`
  - `GET /config`
  - `GET /metrics`
  - `GET /metrics/prometheus`

- `external/maxcore/artifacts/ai-training-server/ai_model/director/audio_director.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/director/awareness_bus.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/director/campaign.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/director/config.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/director/critic.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/director/iterative.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/director/observability.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/director/persistence.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/director/platforms.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/director/social_director.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/director/story_bible.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/director/video_director.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/dynamic_batching.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/generation/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/generation/awareness.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/generation/batching.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/generation/campaign.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/generation/capability.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/generation/dedicated.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/generation/live_serving.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/generation/metadata.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/generation/orchestrator.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/generation/owner.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/generation/plan.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/generation/release.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/generation/social_controls.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/generation/technique.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/accelerated_transformer.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/awareness_kernels.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/candidate_training.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/digital_gpu.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/gpu_trainer.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/hyper_backend.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/hyper_core.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/hyper_creative_transformer.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/hyper_trainer.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/hyper_transformer.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/media_kernels.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/compiler.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/nvcc.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/runtime.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/sm102_kernels.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/kernels.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/prototype.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/opcode_spec.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/pocket_pool.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/pocket_state.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/precision.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/silicon_model.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/silicon_simt_engine.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/sizing.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/telemetry.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/gpu/torch_backend.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/image/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/image/controls.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/image/image_engine.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/intent/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/intent/detector.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/intent/url_reader.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/isolated_audio.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/isolated_audio_worker.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/api.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/base.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/cpu_backend.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/device_backend.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/future_backends.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/registry.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/backend/silicon_simt_backend.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/compiler/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/compiler/passes.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/compiler/pipeline.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/hardware.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/integration.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/ir/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/ir/builder.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/ir/nodes.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/kernels/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/kernels/reference.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/memory/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/memory/pool.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/observability.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/pdim/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/pdim/config.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/pdim/orchestrator.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/pdim/pocket_accelerator.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/pdim/pocket_multiply.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/pdim/replica_scaler.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/pdim/storage.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/pdim/workers.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/precision.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/resource_plan.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/runtime/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/runtime/engine.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/runtime/ops.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/runtime/process_pool.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/runtime/scheduler.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/session.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tensor.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/media_contract.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/model/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/model/candidate_model.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/model/candidate_serving.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/model/candidate_tokenizer.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/model/checkpoint_release.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/model/creative_model.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/model/inference_budget.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/model/post_fix_model_probe.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/model/sampling_context.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/model/tokenizer.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/model/transformer.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/native_analysis/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/native_analysis/api.py` (no mount found in the route registry or direct-mount list) — 5 declared action(s).
  - `POST /image`
  - `POST /video`
  - `POST /text`
  - `POST /website`
  - `POST /upload`

- `external/maxcore/artifacts/ai-training-server/ai_model/native_analysis/assets.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/native_analysis/media.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/native_analysis/safe_http.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/native_analysis/text.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/native_analysis/website.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/platform_optimization.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/quality_awareness.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/render_manager.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/request_intelligence.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/retrieval/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/retrieval/asset_index.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/retrieval/asset_pipeline.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/retrieval/coverage_watchdog.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/retrieval/generated_ingestor.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/retrieval/image_features.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/retrieval/probes.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/retrieval/rcgs.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/api.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/audio/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/audio/nodes.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/audio/spectral.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/fabric/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/fabric/cache.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/fabric/compute.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/fabric/graph.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/fabric/media.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/fabric/scheduler.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/image/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/image/nodes.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/image/path_tracer.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/image/scene_builder.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/video/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/video/color_engine.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/rta/video/nodes.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/safe_feed_xml.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/safety/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/safety/content_safety.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/training/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/training/auto_selection.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/training/candidate_benchmark.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/training/candidate_corpus.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/training/candidate_lifecycle.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/training/candidate_manifest_train.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/training/candidate_registry.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/training/config.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/training/dataset.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/training/live_learning.py` (no mount found in the route registry or direct-mount list) — 3 declared action(s).
  - `GET /api/training/candidates/live`
  - `GET /api/training/candidates/live/{run_id}`
  - `POST /api/training/candidates/live`

- `external/maxcore/artifacts/ai-training-server/ai_model/training/media_learning.py` (no mount found in the route registry or direct-mount list) — 2 declared action(s).
  - `GET /api/training/media/{modality}/preflight`
  - `POST /api/training/media/{modality}/preflight`

- `external/maxcore/artifacts/ai-training-server/ai_model/training/public_curriculum.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/training/public_resume.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/training/storage.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/training/synthetic.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/training/trainer.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/url_parser/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/url_parser/core.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/url_parser/extractors.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/url_parser/models.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/video/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/video/ai_scene_builder.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/video/cinematic_engine.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/video/controls.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/video/dataset_sampler.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/video/diffusion/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/video/diffusion/awareness_conditioner.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/video/diffusion/maxcore_diffusion.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/video/diffusion/music_vae.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/video/diffusion/noise_scheduler.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/video/diffusion/sdedit_prior.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/video/diffusion/temporal_dit.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/video/effects.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/video/ffmpeg_util.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/video/media_manifest.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/video/production.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/video/renderer.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/video/scenes.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/ai_model/video/video_agent.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/control/client.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/daemon/control_daemon.py` (no mount found in the route registry or direct-mount list) — 3 declared action(s).
  - `GET /status`
  - `POST /start_download`
  - `POST /start_training`

- `external/maxcore/artifacts/ai-training-server/download_datasets.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/maxbooster_veo_music/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/maxbooster_veo_music/boostsheets/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/maxbooster_veo_music/boostsheets/schema.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/maxbooster_veo_music/gpu/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/maxbooster_veo_music/model/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/maxbooster_veo_music/model/audio_encoder.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/maxbooster_veo_music/model/boostsheet_encoder.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/maxbooster_veo_music/model/platform_heads.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/maxbooster_veo_music/model/text_encoder.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/maxbooster_veo_music/model/video_generator.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/maxbooster_veo_music/model/video_latent_vae.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/maxbooster_veo_music/pipeline/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/maxbooster_veo_music/pipeline/campaign_generator.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/maxbooster_veo_music/url/__init__.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/maxbooster_veo_music/url/extractor.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/maxcore_server.py` (no mount found in the route registry or direct-mount list) — 38 declared action(s).
  - `GET /health`
  - `GET /models/list`
  - `GET /models/weights`
  - `GET /models/best`
  - `POST /models/weights`
  - `GET /knowledge/curriculum`
  - `POST /knowledge/curriculum`
  - `GET /knowledge/loss-history`
  - `GET /knowledge/sessions`
  - `GET /datasets/list`
  - `GET /datasets/manifest`
  - `GET /datasets/stream`
  - `POST /train/start`
  - `POST /train/stop`
  - `GET /train/status`
  - `GET /control/status`
  - `GET /control/logs`
  - `DELETE /control/logs`
  - `POST /control/restart`
  - `POST /control/shutdown`
  - `POST /control/trigger-session`
  - `POST /control/set-phase`
  - `POST /api/generate/content`
  - `POST /api/generate/text`
  - `POST /api/content/score`
  - `POST /api/analyze`
  - `POST /api/analyze/sentiment`
  - `POST /api/analyze/audio`
  - `POST /api/optimize/ad`
  - `POST /api/predict/engagement`
  - `POST /api/generate/image`
  - `POST /api/generate/audio`
  - `GET /api/audio-job/{job_id}`
  - `GET /models/social/state`
  - `GET /models/advertising/state`
  - `GET /models/content/state`
  - `GET /models/engagement/state`
  - `POST /train/feedback`

- `external/maxcore/artifacts/ai-training-server/patch_datasets.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/patch_v2 (copy).py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/patch_v2.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/patch_v3.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/run_downloader.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/run_maxcore.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/scripts/build_and_train.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/scripts/diagnose-checkpoint-vocabulary.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/scripts/run-maxcore-original-quality.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/server.py` (no mount found in the route registry or direct-mount list) — 138 declared action(s).
  - `GET /api/awareness/unified/status`
  - `GET /api/training/live/status`
  - `POST /api/awareness/unified/context`
  - `GET /ready`
  - `GET /api/ready`
  - `GET /health`
  - `GET /api-keys`
  - `POST /api-keys`
  - `DELETE /api-keys/{key_id}`
  - `POST /api-keys/{key_id}/rotate`
  - `GET /model/status`
  - `GET /gpu/status`
  - `GET /gpu/hyper/status`
  - `GET /gpu/silicon/status`
  - `GET /gpu/capabilities`
  - `GET /training/status`
  - `POST /training/start`
  - `POST /admin/train-bpe-scaleup`
  - `POST /admin/train-hyper-scaleup`
  - `POST /api/maxcore/pocket-multiply`
  - `GET /api/gpu/gen-cache/stats`
  - `GET /api/gpu/replica-pool/stats`
  - `POST /api/gpu/replica-pool/grow`
  - `GET /api/gpu/prefix-kv/stats`
  - `GET /api/gpu/digest-cache/stats`
  - `GET /api/maxcore/pocket-accelerator/stats`
  - `POST /api/awareness/quality/harvest`
  - `GET /api/awareness/quality/status`
  - `GET /training/logs`
  - `POST /training/stop`
  - `GET /training/datasets`
  - `POST /training/schedule`
  - `GET /training/continuous/status`
  - `POST /training/continuous/start`
  - `POST /training/continuous/stop`
  - `GET /training/continuous/history`
  - `GET /training/puller/status`
  - `GET /training/puller/sources`
  - `POST /training/puller/pull`
  - `POST /training/puller/start`
  - `POST /training/puller/stop`
  - `GET /watchdog/status`
  - `GET /watchdog/log`
  - `POST /watchdog/reset`
  - `GET /coverage/status`
  - `GET /coverage/log`
  - `GET /coverage/report`
  - `GET /coverage/ingestor`
  - `POST /coverage/reset`
  - `GET /api/url-parser/content`
  - `GET /api/url-parser/inspect`
  - `GET /api/generation/capabilities`
  - `POST /content/generate`
  - `GET /boostsheets`
  - `GET /dashboard/stats`
  - `GET /storage/status`
  - `POST /storage/feedback`
  - `GET /storage/curriculum/{user_id}`
  - `GET /storage/artist/{profile_id}`
  - `POST /storage/artist/{profile_id}`
  - `POST /storage/artist/{profile_id}/releases`
  - `GET /storage/datasets`
  - `POST /storage/datasets/register`
  - `GET /storage/datasets/audio/status`
  - `POST /storage/datasets/audio/seed`
  - `POST /storage/checkpoint/save`
  - `GET /storage/checkpoint/{model_id}`
  - `GET /storage/checkpoints`
  - `POST /platform/social/generate`
  - `POST /platform/social/autopilot`
  - `POST /platform/daw/generate`
  - `POST /platform/distribution/plan`
  - `GET /platform/video/generate`
  - `POST /platform/video/generate`
  - `GET /platform/model/info`
  - `POST /platform/model/reload`
  - `POST /analyze`
  - `POST /generate/text`
  - `POST /generate/image`
  - `POST /generate/audio`
  - `POST /generate/video`
  - `POST /platform/ads/record`
  - `POST /platform/ads/generate`
  - `POST /platform/ads/autopilot`
  - `POST /platform/ads/audience`
  - `GET /platform/ads/performance/{user_id}`
  - `POST /platform/ads/optimize`
  - `GET /storage/session`
  - `GET /storage/pipeline/status`
  - `POST /training/start-from-storage`
  - `POST /api/generate/content`
  - `POST /api/generate/campaign`
  - `POST /api/campaigns`
  - `GET /api/campaigns`
  - `GET /api/campaigns/{campaign_id}`
  - `DELETE /api/campaigns/{campaign_id}`
  - `PATCH /api/campaigns/{campaign_id}/posts/{post_id}`
  - `POST /api/campaigns/{campaign_id}/schedule`
  - `POST /api/generate/text`
  - `POST /api/content/score`
  - `POST /api/analyze`
  - `POST /api/analyze/sentiment`
  - `POST /api/audio/upload`
  - `POST /api/analyze/audio`
  - `POST /api/optimize/ad`
  - `POST /api/predict/engagement`
  - `POST /api/generate/image`
  - `POST /api/generate/audio`
  - `POST /api/generate-video`
  - `POST /api/video/extend`
  - `POST /api/video/generate-ai`
  - `GET /api/video-job/{job_id}`
  - `DELETE /api/video-job/{job_id}`
  - `GET /api/concurrency/stats`
  - `GET /api/video-jobs`
  - `GET /api/video-job/{job_id}/preview/{scene_idx}`
  - `DELETE /api/audio-job/{job_id}`
  - `GET /api/audio-job/{job_id}`
  - `GET /api/audio/{job_id}/stems`
  - `GET /api/files/stems/{job_id}/{filename}`
  - `GET /api/audio/{job_id}/midi`
  - `GET /api/models/social/state`
  - `GET /api/models/advertising/state`
  - `GET /api/models/content/state`
  - `GET /api/models/engagement/state`
  - `POST /api/train/feedback`
  - `GET /api/health`
  - `POST /api/warm`
  - `GET /api/warm/status`
  - `GET /api/rta/status`
  - `POST /api/safety/screen`
  - `POST /api/audio/mastering-recommendation`
  - `POST /api/audio/mixing-recommendation`
  - `POST /api/audio/analyze`
  - `POST /api/infer/viral-score`
  - `GET /api/video-job/{job_id}/download`
  - `GET /api/video-job/{job_id}/file`
  - `GET /api/video-job/{job_id}/video`

- `external/maxcore/artifacts/ai-training-server/storage_client.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/trusted_http.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/workers/admin_content_loop.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/workers/admin_flywheel.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/workers/continuous_trainer.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/workers/data_puller.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/workers/dataset_manager.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/workers/dataset_worker.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/workers/gpu_monitor.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/workers/gpu_scheduler.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/workers/quality_harvester.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/workers/seed_audio_dataset.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/workers/training_scheduler.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/workers/watchdog.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/main.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `server/routes/ai.ts` (mounted at `/api/ai`) — 29 declared action(s).
  - `POST /api/ai/content/generate`
  - `POST /api/ai/sentiment/analyze`
  - `POST /api/ai/recommendations/get`
  - `POST /api/ai/ads/optimize`
  - `POST /api/ai/social/predict`
  - `POST /api/ai/forecast`
  - `GET /api/ai/health`
  - `POST /api/ai/hashtags/generate`
  - `POST /api/ai/toxicity/analyze`
  - `POST /api/ai/emotions/detect`
  - `GET /api/ai/trends`
  - `POST /api/ai/content/adapt`
  - `GET /api/ai/models`
  - `GET /api/ai/models/:modelId/performance`
  - `GET /api/ai/stats`
  - `POST /api/ai/analytics/predict`
  - `GET /api/ai/analytics/insights/capability`
  - `POST /api/ai/analytics/insights`
  - `GET /api/ai/insights`
  - `GET /api/ai/anomalies`
  - `POST /api/ai/churn/predict`
  - `POST /api/ai/revenue/forecast`
  - `POST /api/ai/organic/optimize`
  - `POST /api/ai/organic/roi`
  - `POST /api/ai/organic/schedule`
  - `GET /api/ai/organic/network-analysis`
  - `GET /api/ai/diffusion/status`
  - `GET /api/ai/simulator/status`
  - `GET /api/ai/diffusion/ready`
  - Local service/schema/storage dependencies: `server/config/ports.ts`, `server/db.ts`, `server/lib/aiSource.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/rateLimiter.ts`, `server/services/accountAnalyticsService.ts`, `server/services/maxcoreControlTransport.ts`, `server/services/notificationService.ts`, `server/services/unifiedAIController.ts`, `shared/schema.ts`

- `server/routes/assistant.ts` (mounted at `/api/assistant`) — 3 declared action(s).
  - `GET /api/assistant/history`
  - `POST /api/assistant/chat`
  - `DELETE /api/assistant/history`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/rateLimiter.ts`, `server/services/maxAssistantService.ts`, `shared/schema.ts`

- `server/routes/content-analysis.ts` (mounted at `/api/content-analysis`) — 8 declared action(s).
  - `POST /api/content-analysis/assets`
  - `POST /api/content-analysis/image`
  - `POST /api/content-analysis/video`
  - `POST /api/content-analysis/audio`
  - `POST /api/content-analysis/text`
  - `POST /api/content-analysis/website`
  - `POST /api/content-analysis/batch`
  - `GET /api/content-analysis/:type/:id`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/lib/aiSource.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/services/contentAnalysisService.ts`, `server/services/maxcoreConnector.ts`

- `server/routes/maxcore.ts` (mounted at `/api/maxcore`) — 23 declared action(s).
  - `GET /api/maxcore/status`
  - `GET /api/maxcore/health`
  - `GET /api/maxcore/logs`
  - `DELETE /api/maxcore/logs`
  - `GET /api/maxcore/train/status`
  - `POST /api/maxcore/train/start`
  - `POST /api/maxcore/train/stop`
  - `POST /api/maxcore/train/trigger-session`
  - `POST /api/maxcore/train/set-phase`
  - `GET /api/maxcore/models`
  - `GET /api/maxcore/datasets`
  - `GET /api/maxcore/datasets/manifest`
  - `GET /api/maxcore/curriculum`
  - `GET /api/maxcore/loss-history`
  - `GET /api/maxcore/sessions`
  - `POST /api/maxcore/restart`
  - `POST /api/maxcore/shutdown`
  - `GET /api/maxcore/downloader/status`
  - `POST /api/maxcore/downloader/stop`
  - `POST /api/maxcore/downloader/start`
  - `POST /api/maxcore/maxcore/stop`
  - `POST /api/maxcore/maxcore/start`
  - `POST /api/maxcore/ai-jobs/push-all`
  - Local service/schema/storage dependencies: `server/logger.ts`

- `server/routes/maxcoreProxy.ts` (mounted at the application root) — 39 declared action(s).
  - `GET /api/awareness/unified/status`
  - `POST /api/awareness/unified/context`
  - `POST /api/internal/generated-artifacts/commit`
  - `POST /api/internal/generated-artifacts/commit`
  - `GET /api/maxcore-media/*mediaPath`
  - `POST /api/audio/upload`
  - `GET /api/platform/video/generate`
  - `GET /api/platform/ads/performance/:userId`
  - `GET /api/video-jobs`
  - `GET /api/video-job/:jobId`
  - `GET /api/video-job/:jobId/preview/:sceneIdx`
  - `GET /api/video-job/:jobId/download`
  - `GET /api/video-job/:jobId/file`
  - `GET /api/video-job/:jobId/video`
  - `GET /api/audio-job/:jobId`
  - `GET /api/audio/:jobId/stems`
  - `GET /api/audio/:jobId/midi`
  - `GET /api/files/stems/:jobId/:filename`
  - `GET /api/storage/artist/:profileId`
  - `GET /api/platform/model/info`
  - `GET /api/generation/capabilities`
  - `GET /api/models/social/state`
  - `GET /api/models/advertising/state`
  - `GET /api/models/content/state`
  - `GET /api/models/engagement/state`
  - `GET /api/training/status`
  - `GET /api/training/live/status`
  - `GET /api/training/logs`
  - `GET /api/training/datasets`
  - `GET /api/training/continuous/status`
  - `GET /api/training/continuous/history`
  - `GET /api/training/puller/status`
  - `GET /api/training/puller/sources`
  - `GET /api/campaigns`
  - `GET /api/campaigns/:campaignId`
  - `DELETE /api/video-job/:jobId`
  - `DELETE /api/campaigns/:campaignId`
  - `PATCH /api/campaigns/:campaignId/posts/:postId`
  - `POST /api/campaigns/:campaignId/schedule`
  - Local service/schema/storage dependencies: `server/logger.ts`, `server/middleware/auth.ts`, `server/services/generatedArtifactValidation.ts`, `server/services/generationAwareness.ts`, `server/services/maxcoreConnector.ts`, `server/services/maxcoreControlTransport.ts`

- `server/routes/studioGeneration.ts` (mounted at `/api/studio/generation`) — 13 declared action(s).
  - `POST /api/studio/generation/text`
  - `POST /api/studio/generation/audio`
  - `GET /api/studio/generation/presets`
  - `GET /api/studio/generation/pattern/instruments`
  - `GET /api/studio/generation/pattern/genres`
  - `GET /api/studio/generation/pattern/styles`
  - `GET /api/studio/generation/pattern/scales`
  - `GET /api/studio/generation/pattern/stats`
  - `POST /api/studio/generation/pattern/melody`
  - `POST /api/studio/generation/pattern/drums`
  - `POST /api/studio/generation/pattern/chords`
  - `POST /api/studio/generation/pattern/arrangement`
  - `POST /api/studio/generation/audio-to-melody`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/lib/aiSource.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/rateLimiter.ts`, `server/middleware/uploadHandler.ts`, `server/services/aiAudioGeneratorService.ts`, `server/services/maxcoreClient.ts`, `server/services/maxcoreConnector.ts`, `server/services/maxcoreControlTransport.ts`, `shared/schema.ts`

Inventory source files: 284.

### collaboration

Source acceptance: **UNVERIFIED**. Inventory contains 1 UI page files, 2 route/worker source files, 32 declared handlers, and 0 unresolved declarations.

UI pages:
- `client/src/pages/Collaborations.tsx` — UI API references: `/api/collaborations`, `/api/collaborations/accept/${connectionId}`, `/api/collaborations/connect`, `/api/collaborations/connections`, `/api/collaborations/connections/pending`, `/api/collaborations/decline/${connectionId}`, `/api/collaborations/projects`, `/api/collaborations/suggestions`

Server route and worker actions:

- `server/routes/collaboration.ts` (mounted at `/api/collaboration`) — 18 declared action(s).
  - `POST /api/collaboration/resolve-conflict`
  - `GET /api/collaboration/presence/:sessionId`
  - `PUT /api/collaboration/presence/:sessionId`
  - `DELETE /api/collaboration/presence/:sessionId`
  - `POST /api/collaboration/version`
  - `GET /api/collaboration/versions/:projectId`
  - `PUT /api/collaboration/versions/:projectId/:versionId/restore`
  - `POST /api/collaboration/versions/:projectId/compare`
  - `DELETE /api/collaboration/versions/:projectId/:versionId`
  - `POST /api/collaboration/access/request`
  - `GET /api/collaboration/access/requests/:projectId`
  - `PUT /api/collaboration/access/:userId`
  - `POST /api/collaboration/comments`
  - `GET /api/collaboration/comments/:projectId`
  - `PUT /api/collaboration/comments/:commentId/resolve`
  - `PUT /api/collaboration/comments/:commentId/mention-resolved`
  - `GET /api/collaboration/conflicts/:projectId`
  - `POST /api/collaboration/detect-conflict`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`

- `server/routes/collaborations.ts` (mounted at `/api/collaborations`) — 14 declared action(s).
  - `GET /api/collaborations/`
  - `GET /api/collaborations/connections`
  - `GET /api/collaborations/connections/pending`
  - `POST /api/collaborations/connect`
  - `POST /api/collaborations/accept/:id`
  - `POST /api/collaborations/decline/:id`
  - `DELETE /api/collaborations/connections/:id`
  - `GET /api/collaborations/suggestions`
  - `GET /api/collaborations/projects`
  - `POST /api/collaborations/projects`
  - `POST /api/collaborations/projects/:id/join`
  - `POST /api/collaborations/projects/:id/leave`
  - `GET /api/collaborations/search`
  - `GET /api/collaborations/connection-status/:userId`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/services/collaborationService.ts`

Inventory source files: 3.

### marketplace

Source acceptance: **UNVERIFIED**. Inventory contains 4 UI page files, 5 route/worker source files, 144 declared handlers, and 0 unresolved declarations.

UI pages:
- `client/src/pages/Marketplace.tsx` — UI API references: `/api/`, `/api/marketplace/affiliates`, `/api/marketplace/ai-recommendations`, `/api/marketplace/audio/${audioUrl.replace(/^\/+/,`, `/api/marketplace/audio/${audioUrl}`, `/api/marketplace/beats`, `/api/marketplace/beats${params.toString() ?`, `/api/marketplace/beats/${beatId}`, `/api/marketplace/beats/${beatId}/like`, `/api/marketplace/beats/${beatId}/rate`, `/api/marketplace/beats/${deepLinkedBeatId}`, `/api/marketplace/collaborations`, `/api/marketplace/connect-stripe`, `/api/marketplace/contracts`, `/api/marketplace/contracts/${id}`, `/api/marketplace/escrow`, `/api/marketplace/escrow/${transactionId}/release`, `/api/marketplace/follow/${producerId}`, `/api/marketplace/for-you`, `/api/marketplace/license-templates`, `/api/marketplace/license-templates/${id}`, `/api/marketplace/listings/${beatId}`, `/api/marketplace/listings/${id}`, `/api/marketplace/my-beats`, `/api/marketplace/producers`, `/api/marketplace/producers/`, `/api/marketplace/producers/${producerId}/follow-status`, `/api/marketplace/purchase`, `/api/marketplace/purchases`, `/api/marketplace/purchases/${purchase.id}/license-agreement`, `/api/marketplace/purchases/${purchase.id}/license-agreement?format=download`, `/api/marketplace/sales-analytics`, `/api/marketplace/unfollow/${producerId}`, `/api/marketplace/upload`, `/api/merch`, `/api/merch/${id}`, `/api/merch/orders`, `/api/merch/stats`, `/api/storage/upload`, `/api/storefront/_/listings/${beatId}/discount`, `/api/storefront/_/listings/${beatId}/tiers`
- `client/src/pages/MerchStore.tsx` — UI API references: `/api/merch`, `/api/merch/${id}`, `/api/merch/orders`, `/api/merch/orders/${id}`, `/api/merch/stats`, `/api/storage/upload`
- `client/src/pages/Storefront.tsx` — UI API references: `/api/`, `/api/marketplace/audio/${audioUrl.replace(/^\/+/,`, `/api/marketplace/audio/${audioUrl}`, `/api/storefront/${encodeURIComponent(storefront!.id)}/orders`, `/api/storefront/${storefront!.id}/checkout`, `/api/storefront/${storefront!.id}/checkout/preview`, `/api/storefront/${storefront!.id}/follow`, `/api/storefront/${storefront!.id}/like`, `/api/storefront/${storefront!.id}/listings`, `/api/storefront/${storefront!.id}/membership-tiers/public`, `/api/storefront/${storefront!.id}/rate`, `/api/storefront/${storefront?.id}/bogo-promotions`, `/api/storefront/${storefront?.id}/listings`, `/api/storefront/${storefront?.id}/membership-tiers/public`, `/api/storefront/${storefront?.id}/orders`, `/api/storefront/${storefront?.id}/social`, `/api/storefront/preview/${slug}`, `/api/storefront/public/${slug}`, `/api/storefront/subscribe/${tierId}`
- `client/src/pages/SyncLicensing.tsx` — UI API references: `/api/sync-licensing`, `/api/sync-licensing/${id}`, `/api/sync-licensing/stats`

Server route and worker actions:

- `server/routes/marketplace.ts` (mounted at `/api/marketplace`) — 53 declared action(s).
  - `GET /api/marketplace/orders/:orderId/license`
  - `GET /api/marketplace/beats`
  - `GET /api/marketplace/producer-analytics`
  - `GET /api/marketplace/license-templates`
  - `POST /api/marketplace/license-templates`
  - `PUT /api/marketplace/license-templates/:id`
  - `DELETE /api/marketplace/license-templates/:id`
  - `GET /api/marketplace/my-beats`
  - `GET /api/marketplace/producers`
  - `GET /api/marketplace/purchases`
  - `GET /api/marketplace/sales-analytics`
  - `POST /api/marketplace/interaction`
  - `GET /api/marketplace/for-you`
  - `GET /api/marketplace/ai-recommendations`
  - `GET /api/marketplace/taste-profile`
  - `POST /api/marketplace/follow-producer`
  - `POST /api/marketplace/unfollow-producer`
  - `POST /api/marketplace/checkout/initiate`
  - `POST /api/marketplace/purchase`
  - `GET /api/marketplace/purchases/:orderId/license-agreement`
  - `GET /api/marketplace/escrow`
  - `GET /api/marketplace/affiliates`
  - `GET /api/marketplace/contracts`
  - `GET /api/marketplace/contracts/:id`
  - `PATCH /api/marketplace/contracts/:id`
  - `DELETE /api/marketplace/contracts/:id`
  - `GET /api/marketplace/collaborations`
  - `POST /api/marketplace/upload`
  - `GET /api/marketplace/audio/*path`
  - `GET /api/marketplace/cover/*path`
  - `PUT /api/marketplace/listings/:id`
  - `DELETE /api/marketplace/listings/:id`
  - `POST /api/marketplace/connect-stripe`
  - `POST /api/marketplace/follow/:producerId`
  - `POST /api/marketplace/escrow/:transactionId/release`
  - `POST /api/marketplace/affiliates`
  - `POST /api/marketplace/contracts`
  - `POST /api/marketplace/collaborations`
  - `GET /api/marketplace/producers/:producerId`
  - `GET /api/marketplace/producers/:producerId/follow-status`
  - `POST /api/marketplace/unfollow/:producerId`
  - `GET /api/marketplace/beats/:beatId`
  - `POST /api/marketplace/beats/:beatId/like`
  - `GET /api/marketplace/beats/:beatId/like-status`
  - `POST /api/marketplace/beats/:beatId/rate`
  - `GET /api/marketplace/beats/:beatId/rating`
  - `GET /api/marketplace/stems/:stemId`
  - `POST /api/marketplace/stems/:stemId/purchase`
  - `GET /api/marketplace/stems/:stemId/download/:trackId`
  - `GET /api/marketplace/my-stems`
  - `GET /api/marketplace/listings/:listingId/stems`
  - `POST /api/marketplace/listings/:listingId/stems`
  - `DELETE /api/marketplace/stems/:stemId`
  - Local service/schema/storage dependencies: `server/config/defaults.ts`, `server/db.ts`, `server/infrastructure/distributedCache.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/uploadHandler.ts`, `server/services/audioSeparatorService.ts`, `server/services/beatMoneyLoopAudioAccess.ts`, `server/services/discoveryAlgorithmService.ts`, `server/services/marketplaceService.ts`, `server/services/marketplaceStemAccess.ts`, `server/services/maxcoreConnector.ts`, `server/services/notificationService.ts`, `server/services/pythonAIService.ts`, `server/services/storageService.ts`, `server/storage`

- `server/routes/merch.ts` (mounted at `/api/merch`) — 10 declared action(s).
  - `GET /api/merch/store/:artistId`
  - `POST /api/merch/checkout`
  - `GET /api/merch/`
  - `POST /api/merch/`
  - `PUT /api/merch/:id`
  - `DELETE /api/merch/:id`
  - `GET /api/merch/orders`
  - `PUT /api/merch/orders/:id`
  - `GET /api/merch/stats`
  - `GET /api/merch/:id`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/pagination.ts`, `server/middleware/requestValidation.ts`, `server/services/merchCheckoutService.ts`

- `server/routes/storefront.ts` (mounted at `/api/storefront`) — 47 declared action(s).
  - `GET /api/storefront/templates`
  - `GET /api/storefront/my`
  - `GET /api/storefront/public/:slug`
  - `GET /api/storefront/suggest-url`
  - `GET /api/storefront/check-domain`
  - `GET /api/storefront/preview/:slug`
  - `GET /api/storefront/generate-slug`
  - `GET /api/storefront/:slug`
  - `POST /api/storefront/create`
  - `PUT /api/storefront/:id/customize`
  - `PATCH /api/storefront/:id/publish`
  - `DELETE /api/storefront/:id`
  - `GET /api/storefront/:storefrontId/membership-tiers`
  - `POST /api/storefront/:storefrontId/membership-tiers`
  - `PUT /api/storefront/membership-tiers/:tierId`
  - `DELETE /api/storefront/membership-tiers/:tierId`
  - `POST /api/storefront/subscribe/:tierId`
  - `POST /api/storefront/memberships/:membershipId/cancel`
  - `GET /api/storefront/memberships/my`
  - `GET /api/storefront/:storefrontId/membership-tiers/public`
  - `GET /api/storefront/:storefrontId/listings`
  - `POST /api/storefront/generate-subdomain`
  - `GET /api/storefront/check-subdomain/:subdomain`
  - `GET /api/storefront/subdomain/:subdomain`
  - `PUT /api/storefront/:storefrontId/subdomain`
  - `PUT /api/storefront/:storefrontId/custom-domain`
  - `POST /api/storefront/:storefrontId/verify-domain`
  - `POST /api/storefront/upload-asset`
  - `GET /api/storefront/:id/social`
  - `POST /api/storefront/:id/like`
  - `POST /api/storefront/:id/follow`
  - `POST /api/storefront/:id/rate`
  - `POST /api/storefront/:id/checkout`
  - `GET /api/storefront/orders/:orderId/download`
  - `GET /api/storefront/:id/orders`
  - `PUT /api/storefront/:storefrontId/listings/:listingId/discount`
  - `DELETE /api/storefront/:storefrontId/listings/:listingId/discount`
  - `GET /api/storefront/:storefrontId/listings/:listingId/tiers`
  - `PUT /api/storefront/:storefrontId/listings/:listingId/tiers`
  - `DELETE /api/storefront/:storefrontId/listings/:listingId/tiers`
  - `POST /api/storefront/:storefrontId/listings/:listingId/tier-audio`
  - `GET /api/storefront/:storefrontId/bogo-promotions`
  - `GET /api/storefront/:storefrontId/bogo-promotions/all`
  - `POST /api/storefront/:storefrontId/bogo-promotions`
  - `PUT /api/storefront/:storefrontId/bogo-promotions/:promoId`
  - `DELETE /api/storefront/:storefrontId/bogo-promotions/:promoId`
  - `POST /api/storefront/:id/checkout/preview`
  - Local service/schema/storage dependencies: `server/config/defaults.ts`, `server/config/env.ts`, `server/config/storefrontUrls.ts`, `server/db.ts`, `server/lib/stripeClient.ts`, `server/logger.ts`, `server/middleware/uploadHandler.ts`, `server/modules/domains/dnsValidators.ts`, `server/services/hybridStorageService.ts`, `server/services/storageService.ts`, `server/services/storefrontService.ts`, `server/services/stripeCheckoutOperations.ts`

- `server/routes/storefrontDomains.ts` (mounted at `/api/storefront-domains`) — 22 declared action(s).
  - `GET /api/storefront-domains/resolve/:label`
  - `POST /api/storefront-domains/managed/check`
  - `POST /api/storefront-domains/managed/reserve`
  - `POST /api/storefront-domains/custom/request`
  - `POST /api/storefront-domains/custom/verify`
  - `GET /api/storefront-domains/storefront/:storefrontId`
  - `DELETE /api/storefront-domains/:domainId`
  - `POST /api/storefront-domains/storefront/:storefrontId/publish`
  - `POST /api/storefront-domains/storefront/:storefrontId/unpublish`
  - `POST /api/storefront-domains/platform/check`
  - `GET /api/storefront-domains/registry/:domain`
  - `POST /api/storefront-domains/platform/claim`
  - `GET /api/storefront-domains/platform/:storefrontId`
  - `GET /api/storefront-domains/search`
  - `GET /api/storefront-domains/propagation`
  - `GET /api/storefront-domains/propagation/setup`
  - `GET /api/storefront-domains/domain-status/:domainId`
  - `GET /api/storefront-domains/dns/status`
  - `POST /api/storefront-domains/storefront/:storefrontId/attach-domain`
  - `POST /api/storefront-domains/custom/verify-status/:domainId`
  - `DELETE /api/storefront-domains/custom/detach/:domainId`
  - `GET /api/storefront-domains/hosts/:host`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/modules/domains/dnsValidators.ts`, `server/modules/domains/domain.controller.ts`, `server/modules/publish/publish.service.ts`

- `server/routes/syncLicensing.ts` (mounted at `/api/sync-licensing`) — 12 declared action(s).
  - `GET /api/sync-licensing/`
  - `GET /api/sync-licensing/stats`
  - `GET /api/sync-licensing/inquiries`
  - `GET /api/sync-licensing/:id`
  - `POST /api/sync-licensing/`
  - `PUT /api/sync-licensing/:id`
  - `PATCH /api/sync-licensing/:id/status`
  - `DELETE /api/sync-licensing/:id`
  - `GET /api/sync-licensing/supervisor/browse`
  - `POST /api/sync-licensing/:syncId/inquire`
  - `PATCH /api/sync-licensing/inquiries/:inquiryId`
  - `POST /api/sync-licensing/:syncId/generate-license`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/middleware/auth.ts`, `server/middleware/pagination.ts`

Inventory source files: 9.

### subscriptions

Source acceptance: **UNVERIFIED**. Inventory contains 1 UI page files, 2 route/worker source files, 28 declared handlers, and 0 unresolved declarations.

UI pages:
- `client/src/pages/RegisterPayment.tsx` — UI API references: `/api/create-checkout-session`

Server route and worker actions:

- `server/routes/billing.ts` (mounted at `/api/billing`) — 24 declared action(s).
  - `GET /api/billing/plans`
  - `POST /api/billing/create-checkout-session`
  - `GET /api/billing/subscription`
  - `GET /api/billing/payment-method`
  - `GET /api/billing/history`
  - `POST /api/billing/cancel-subscription`
  - `POST /api/billing/reactivate-subscription`
  - `GET /api/billing/invoices/:invoiceId/download`
  - `POST /api/billing/update-payment`
  - `POST /api/billing/create-portal-session`
  - `POST /api/billing/refund`
  - `GET /api/billing/refund/:refundId`
  - `GET /api/billing/order/:orderId/refunds`
  - `GET /api/billing/ledger`
  - `POST /api/billing/retry-payment`
  - `DELETE /api/billing/payment-method`
  - `POST /api/billing/3ds/confirm`
  - `POST /api/billing/refund/request`
  - `POST /api/billing/dispute/evidence`
  - `GET /api/billing/grace-period-status`
  - `GET /api/billing/disputes`
  - `GET /api/billing/invoices`
  - `GET /api/billing/refunds`
  - `GET /api/billing/usage`
  - Local service/schema/storage dependencies: `server/config/env.ts`, `server/db.ts`, `server/lib/stripeClient.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/rateLimiter.ts`, `server/services/billingAccountStatus.ts`, `server/services/checkoutPricing.ts`, `server/services/externalServices.ts`, `server/services/instantPayoutService.ts`, `server/services/notificationService.ts`, `server/services/stripeCheckoutOperations.ts`, `server/services/stripeService.ts`

- `server/routes/paymentBypass.ts` (mounted at `/api/admin/payment-bypass`) — 4 declared action(s).
  - `GET /api/admin/payment-bypass/status`
  - `POST /api/admin/payment-bypass/activate`
  - `POST /api/admin/payment-bypass/deactivate`
  - `POST /api/admin/payment-bypass/extend`
  - Local service/schema/storage dependencies: `server/logger.ts`, `server/middleware/auth.ts`, `server/services/paymentBypassService.ts`

Inventory source files: 3.

### administration

Source acceptance: **UNVERIFIED**. Inventory contains 12 UI page files, 14 route/worker source files, 109 declared handlers, and 0 unresolved declarations.

UI pages:
- `client/src/pages/Admin.tsx` — UI API references: `/api/admin/analytics`, `/api/admin/financial-config/label-settings`, `/api/admin/financial-config/label-settings/${key}`, `/api/admin/financial-config/royalty-rates`, `/api/admin/financial-config/royalty-rates/${id}`, `/api/admin/financial-config/tax-treaties`, `/api/admin/financial-config/tax-treaties/${id}`, `/api/admin/moderation/reports`, `/api/admin/moderation/reports/${reportId}/review`, `/api/admin/payment-bypass/activate`, `/api/admin/payment-bypass/deactivate`, `/api/admin/payment-bypass/extend`, `/api/admin/payment-bypass/status`, `/api/admin/settings`, `/api/admin/system-health`, `/api/admin/users`, `/api/admin/users/${userId}`, `/api/admin/users/${userId}/reactivate`, `/api/admin/users/${userId}/suspend`, `/api/admin/users/export`, `/api/dns/resolver/status`, `/api/kill-switch/kill-all`, `/api/kill-switch/resume-all`
- `client/src/pages/AdminAutonomy.tsx` — UI API references: `/api/admin/chain-fixer/force-check`, `/api/admin/chain-fixer/status`, `/api/admin/platform-fixer/scan`, `/api/admin/platform-fixer/status`, `/api/auto-updates/changes`, `/api/auto-updates/run-once`, `/api/auto-updates/simulation`, `/api/auto-updates/start`, `/api/auto-updates/status`, `/api/auto-updates/stop`, `/api/auto-updates/upgrades`, `/api/auto/social/start`, `/api/auto/social/status`, `/api/auto/social/stop`, `/api/autopilot/start`, `/api/autopilot/status`, `/api/autopilot/stop`, `/api/kill-switch/kill-all`, `/api/kill-switch/kill/${system}`, `/api/kill-switch/resume-all`, `/api/kill-switch/resume/${system}`, `/api/kill-switch/status`, `/api/security/metrics`, `/api/security/self-healing/metrics`, `/api/security/self-healing/status`, `/api/security/threats`
- `client/src/pages/AdminDashboard.tsx` — UI API references: `/api/admin/activity`, `/api/admin/analytics`, `/api/admin/beat-money-loop/${action}`, `/api/admin/beat-money-loop/status`, `/api/admin/metrics`, `/api/admin/system-health`, `/api/admin/tokens`, `/api/admin/tokens/revoke`, `/api/admin/users`, `/api/admin/users?${params}`, `/api/admin/webhooks/${id}/retry`, `/api/admin/webhooks/dead-letter`, `/api/audit/results`, `/api/logs/query`, `/api/testing/results`
- `client/src/pages/DeveloperApi.tsx` — UI API references: `${window.location.origin}/api/v1`, `/api/developer/keys`, `/api/developer/keys/${encodeURIComponent(keyId)}`, `/api/developer/keys/create`, `/api/developer/usage`
- `client/src/pages/SecurityPage.tsx` — no literal API URL found; inspect imported hooks/components.
- `client/src/pages/admin/AuditLog.tsx` — UI API references: `/api/admin/audit-log/summary`, `/api/admin/audit-log?${queryParams}`
- `client/src/pages/admin/ContentSampler.tsx` — UI API references: `/api/admin/content-sampler/beats`, `/api/admin/content-sampler/matrix`, `/api/admin/content-sampler/posts`, `/api/admin/content-sampler/posts?genre=${encodeURIComponent(genre)}`, `/api/admin/content-sampler/summary`
- `client/src/pages/admin/KYCReview.tsx` — UI API references: `/api/kyc/admin/documents/${doc.id}/view`, `/api/kyc/admin/documents/${documentId}/review`, `/api/kyc/admin/pending`, `/api/kyc/admin/pending?status=${statusFilter}`, `/api/kyc/admin/review/${verificationId}`
- `client/src/pages/admin/SecurityDashboard.tsx` — UI API references: `/api/security/anomaly-detection`, `/api/security/behavioral-alerts`, `/api/security/behavioral-alerts/${alertId}/resolve`, `/api/security/metrics`, `/api/security/pentest-results`
- `client/src/pages/admin/SupportDashboard.tsx` — UI API references: `/api/support/stats`, `/api/support/tickets/${ticketId}`, `/api/support/tickets/all?${params.toString()}`
- `client/src/pages/admin/SupportTicketDetail.tsx` — UI API references: `/api/support/tickets/${ticketId}`, `/api/support/tickets/${ticketId}/messages`, `/api/support/tickets/${ticketId}/tags`, `/api/support/tickets/${ticketId}/tags/${encodeURIComponent(tag)}`
- `client/src/pages/admin/TrainingDashboard.tsx` — UI API references: `/api/training/datasets`, `/api/training/schedule`, `/api/training/start`, `/api/training/status`, `/api/training/stop`

Server route and worker actions:

- `external/maxcore/artifacts/ai-training-server/workers/admin_content_loop.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `external/maxcore/artifacts/ai-training-server/workers/admin_flywheel.py` (no mount found in the route registry or direct-mount list) — 0 declared action(s).

- `server/routes/admin.ts` (mounted at `/api/admin`) — 54 declared action(s).
  - `POST /api/admin/tokens`
  - `POST /api/admin/tokens/revoke`
  - `GET /api/admin/dashboard`
  - `GET /api/admin/users`
  - `GET /api/admin/users/export`
  - `GET /api/admin/users/:userId`
  - `PUT /api/admin/users/:userId`
  - `POST /api/admin/users/:userId/suspend`
  - `POST /api/admin/users/:userId/reactivate`
  - `DELETE /api/admin/users/:userId`
  - `POST /api/admin/subscriptions/lifetime`
  - `GET /api/admin/system-health`
  - `GET /api/admin/moderation/reports`
  - `POST /api/admin/moderation/reports/:reportId/review`
  - `POST /api/admin/moderation/content/:contentId/remove`
  - `POST /api/admin/moderation/users/:userId/warn`
  - `POST /api/admin/moderation/users/:userId/ban`
  - `GET /api/admin/analytics`
  - `GET /api/admin/metrics`
  - `GET /api/admin/settings`
  - `POST /api/admin/settings/notifications`
  - `POST /api/admin/settings/maintenance`
  - `POST /api/admin/settings/registration`
  - `GET /api/admin/activity`
  - `POST /api/admin/users/:userId/email`
  - `GET /api/admin/financial-config/royalty-rates`
  - `PATCH /api/admin/financial-config/royalty-rates/:id`
  - `GET /api/admin/financial-config/tax-treaties`
  - `PATCH /api/admin/financial-config/tax-treaties/:id`
  - `GET /api/admin/financial-config/label-settings`
  - `PATCH /api/admin/financial-config/label-settings/:key`
  - `GET /api/admin/chain-fixer/status`
  - `POST /api/admin/chain-fixer/reset/:patternId`
  - `GET /api/admin/autofix/directive`
  - `GET /api/admin/autofix/directive/status`
  - `GET /api/admin/knowledge-base`
  - `POST /api/admin/knowledge-base/classify`
  - `POST /api/admin/chain-fixer/force-check`
  - `GET /api/admin/platform-fixer/status`
  - `GET /api/admin/platform-fixer/subsystems`
  - `GET /api/admin/platform-fixer/patches`
  - `GET /api/admin/platform-fixer/incidents`
  - `POST /api/admin/platform-fixer/scan`
  - `POST /api/admin/platform-fixer/probe/:name`
  - `POST /api/admin/platform-fixer/patch/:id/revert`
  - `GET /api/admin/platform-fixer/degraded-routes`
  - `GET /api/admin/permanent-fixes`
  - `GET /api/admin/intelligence/status`
  - `GET /api/admin/intelligence/narrative`
  - `GET /api/admin/intelligence/insights`
  - `GET /api/admin/intelligence/security`
  - `GET /api/admin/intelligence/events`
  - `POST /api/admin/intelligence/analyze`
  - `POST /api/admin/sentry-test`
  - Local service/schema/storage dependencies: `server/config/env.ts`, `server/db.ts`, `server/instrument.ts`, `server/lib/paymentPreferencePrivacy.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/safety/killSwitch.ts`, `server/services/adminApiTokenService.ts`, `server/services/chainErrorAutoFixer.ts`, `server/services/moderationDecisionService.ts`, `server/services/permanentFixRegistry.ts`, `server/services/platformAutoFixer.ts`, `server/services/systemIntelligence.ts`, `shared/schema.ts`

- `server/routes/admin/auditLog.ts` (mounted at `/api/admin/audit-log`) — 2 declared action(s).
  - `GET /api/admin/audit-log/`
  - `GET /api/admin/audit-log/summary`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`

- `server/routes/admin/beatMoneyLoop.ts` (mounted at `/api/admin/beat-money-loop`) — 6 declared action(s).
  - `GET /api/admin/beat-money-loop/status`
  - `POST /api/admin/beat-money-loop/enable`
  - `POST /api/admin/beat-money-loop/disable`
  - `POST /api/admin/beat-money-loop/run-now`
  - `GET /api/admin/beat-money-loop/cycles`
  - `GET /api/admin/beat-money-loop/health-score`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/services/beatMoneyLoopService.ts`

- `server/routes/admin/contentSampler.ts` (mounted at `/api/admin/content-sampler`) — 4 declared action(s).
  - `GET /api/admin/content-sampler/beats`
  - `GET /api/admin/content-sampler/posts`
  - `GET /api/admin/content-sampler/matrix`
  - `GET /api/admin/content-sampler/summary`
  - Local service/schema/storage dependencies: `server/logger.ts`, `server/middleware/auth.ts`

- `server/routes/admin/index.ts` (mounted at `/api/admin`) — 5 declared action(s).
  - `PUT /api/admin/settings`
  - `POST /api/admin/settings/rate-limit`
  - `POST /api/admin/settings/webhook`
  - `POST /api/admin/users/:userId/report`
  - `POST /api/admin/moderation/:id/action`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `server/services/moderationDecisionService.ts`, `shared/schema.ts`

- `server/routes/admin/intelligence.ts` (no mount found in the route registry or direct-mount list) — 6 declared action(s).
  - `GET /status`
  - `GET /narrative`
  - `GET /insights`
  - `GET /security`
  - `GET /events`
  - `POST /analyze`
  - Local service/schema/storage dependencies: `server/logger.ts`, `server/services/systemIntelligence.ts`

- `server/routes/admin/metrics.ts` (mounted at `/api/admin/metrics`) — 6 declared action(s).
  - `GET /api/admin/metrics/metrics`
  - `POST /api/admin/metrics/metrics/test`
  - `GET /api/admin/metrics/alerts/incidents`
  - `POST /api/admin/metrics/alerts/rules`
  - `POST /api/admin/metrics/alerts/evaluate`
  - `GET /api/admin/metrics/email/stats`
  - Local service/schema/storage dependencies: `server/logger.ts`, `server/middleware/auth.ts`, `server/services/emailTrackingService.ts`, `server/services/metricsService.ts`

- `server/routes/backup.ts` (mounted at `/api/backup`) — 5 declared action(s).
  - `POST /api/backup/create`
  - `POST /api/backup/pdim/create`
  - `GET /api/backup/pdim/jobs/:jobId`
  - `GET /api/backup/list`
  - `GET /api/backup/metrics`
  - Local service/schema/storage dependencies: `server/logger.ts`, `server/middleware/auth.ts`, `server/middleware/csrf.ts`, `server/services/backup/databaseBackupService.ts`, `server/services/backup/pdimRecoveryBackupService.ts`

- `server/routes/developerApi.ts` (mounted at `/api/developer`) — 6 declared action(s).
  - `POST /api/developer/keys/create`
  - `GET /api/developer/keys`
  - `DELETE /api/developer/keys/:keyId`
  - `GET /api/developer/usage`
  - `GET /api/developer/usage/:keyId`
  - `GET /api/developer/docs`
  - Local service/schema/storage dependencies: `server/logger.ts`, `server/services/apiKeyService.ts`

- `server/routes/recoveryCodes.ts` (mounted at `/api/auth/recovery-codes`) — 3 declared action(s).
  - `GET /api/auth/recovery-codes/status`
  - `POST /api/auth/recovery-codes/generate`
  - `POST /api/auth/recovery-codes/verify`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`

- `server/routes/security.ts` (mounted at `/api/security`) — 8 declared action(s).
  - `GET /api/security/metrics`
  - `GET /api/security/behavioral-alerts`
  - `PATCH /api/security/behavioral-alerts/:alertId/resolve`
  - `GET /api/security/anomaly-detection`
  - `GET /api/security/pentest-results`
  - `GET /api/security/threats`
  - `GET /api/security/alerts`
  - `POST /api/security/alerts/:alertId/dismiss`
  - Local service/schema/storage dependencies: `server/db.ts`, `server/logger.ts`, `server/middleware/auth.ts`, `shared/schema.ts`

- `server/routes/webhooks-admin.ts` (mounted at `/api/admin/webhooks`) — 4 declared action(s).
  - `GET /api/admin/webhooks/dead-letter`
  - `POST /api/admin/webhooks/dead-letter/:id/retry`
  - `POST /api/admin/webhooks/:id/retry`
  - `DELETE /api/admin/webhooks/dead-letter/:id`
  - Local service/schema/storage dependencies: `server/logger.ts`, `server/middleware/auth.ts`

Inventory source files: 26.

## Evidence boundary

The executable outcomes and provider-blocked actions are recorded in [admin-domain-acceptance.md](admin-domain-acceptance.md). This inventory must be regenerated after changing source with `node scripts/testing/admin-gap-inventory.mjs`, then reviewed; discovery does not promote an action to PASS.
