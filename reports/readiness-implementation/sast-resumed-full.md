# SCAN-05 SAST recovery evidence

**Disposition: INCOMPLETE**

This is independent local Semgrep evidence. It does not certify production readiness or alter any security gate.
Finding records intentionally contain no matched source text, metavariable values, or secret values.

## Scanner and rules

- Scanner: Semgrep 1.172.0
- Isolation: PYTHONPATH/PYTHONHOME removed only for scanner children; PYTHONNOUSERSITE=1
- Metrics/version checks: disabled; code upload and autofix: not used
- p/security-audit: 225 rules; source https://semgrep.dev/c/p/security-audit; SHA-256 `b109a039df712f30c6d3e25e1e8358053fd0f1c91b92d0e8d2871cd141fe602f`; ETag `W/"eba951b81c18bf273fd189807814713b13bff45e"`
- local/inventory-coverage-probes: 11 rules; source scanner-built-in; SHA-256 `a500f2d2090d18a56e98052badff524492c27be6ce451c607726f049685bcd9d`; ETag `not supplied`

Registry packs do not expose a semantic pack version in their fetched YAML. The byte digest and HTTP ETag above are the exact rule revision identifiers used.
The built-in, improbable marker coverage probes force Semgrep to parse every supported inventoried language even where registry rules intentionally exclude tests. They add no finding suppression and do not replace the security-audit rules; any coincidental marker match remains visible as an INFO result.

## Coverage

- Git-tracked first-party source inventory: 3224 files / 41722337 bytes
- Inventory manifest SHA-256: `c4b8cdc16366f268521851da2d9c2da7798659aa9713c71d6c7ac2d456cd52c2`
- Scanner-reported paths: 3224
- Omitted inventory paths: 0
- Parse/scanner errors: 71; explicit skips: 0

| Language | Inventory | Scanned | Omitted |
|---|---:|---:|---:|
| dockerfile | 7 | 7 | 0 |
| go | 4 | 4 | 0 |
| javascript | 88 | 88 | 0 |
| python | 350 | 350 | 0 |
| rust | 9 | 9 | 0 |
| typescript | 2766 | 2766 | 0 |

Generated dependencies, generated bundles, evidence/report caches, attached assets, and release/archive outputs are excluded. Nested first-party source under external/maxcore and external/pdim remains included; only nested generated segments such as dist are excluded.

## Findings

- Total: 58
- Severity counts: {"WARNING":50,"ERROR":8}

| Priority | Rule | Location | CWE |
|---|---|---|---|
| P2 | python.lang.security.deserialization.pickle.avoid-pickle | external/maxcore/artifacts/ai-training-server/ai_model/gpu/hyper_creative_transformer.py:95 | CWE-502: Deserialization of Untrusted Data |
| P2 | python.lang.security.deserialization.pickle.avoid-pickle | external/maxcore/artifacts/ai-training-server/ai_model/gpu/hyper_creative_transformer.py:113 | CWE-502: Deserialization of Untrusted Data |
| P2 | python.lang.security.insecure-hash-algorithms.insecure-hash-algorithm-sha1 | external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/compiler.py:109 | CWE-327: Use of a Broken or Risky Cryptographic Algorithm |
| P2 | python.lang.security.insecure-hash-algorithms.insecure-hash-algorithm-sha1 | external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/cuda/nvcc.py:189 | CWE-327: Use of a Broken or Risky Cryptographic Algorithm |
| P2 | python.lang.security.insecure-hash-algorithms.insecure-hash-algorithm-sha1 | external/maxcore/artifacts/ai-training-server/ai_model/gpu/native/prototype.py:38 | CWE-327: Use of a Broken or Risky Cryptographic Algorithm |
| P2 | python.lang.security.audit.exec-detected.exec-detected | external/maxcore/artifacts/ai-training-server/ai_model/isolated_audio_worker.py:36 | CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code ('Eval Injection') |
| P2 | python.lang.security.deserialization.pickle.avoid-pickle | external/maxcore/artifacts/ai-training-server/ai_model/maxcore/runtime/process_pool.py:322 | CWE-502: Deserialization of Untrusted Data |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/endpoint_load_test.py:89 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | external/maxcore/artifacts/ai-training-server/download_datasets.py:233 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | external/maxcore/artifacts/ai-training-server/download_datasets.py:256 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | external/maxcore/artifacts/ai-training-server/download_datasets.py:327 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | external/maxcore/artifacts/ai-training-server/maxbooster_veo_music/url/extractor.py:136 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | external/maxcore/artifacts/ai-training-server/server.py:3873 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | external/maxcore/artifacts/ai-training-server/storage_client.py:277 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | external/maxcore/artifacts/ai-training-server/storage_client.py:360 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | external/maxcore/artifacts/ai-training-server/tests/test_audio_bpm_key_match.py:55 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | external/maxcore/artifacts/ai-training-server/tests/test_audio_bpm_key_match.py:365 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | external/maxcore/artifacts/ai-training-server/tests/test_awareness_and_quality.py:52 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | external/maxcore/artifacts/ai-training-server/tests/test_content_endpoints.py:41 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.exec-detected.exec-detected | external/maxcore/artifacts/ai-training-server/tests/test_isolated_audio.py:59 | CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code ('Eval Injection') |
| P2 | python.lang.security.audit.exec-detected.exec-detected | external/maxcore/artifacts/ai-training-server/tests/test_media_delivery_contract.py:30 | CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code ('Eval Injection') |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | external/maxcore/artifacts/ai-training-server/tests/test_smoke_load.py:131 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | external/maxcore/artifacts/ai-training-server/tests/test_veo_parity.py:26 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.insecure-hash-algorithms.insecure-hash-algorithm-sha1 | external/maxcore/artifacts/ai-training-server/workers/data_puller.py:79 | CWE-327: Use of a Broken or Risky Cryptographic Algorithm |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | external/maxcore/artifacts/ai-training-server/workers/data_puller.py:502 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | external/maxcore/artifacts/ai-training-server/workers/quality_harvester.py:77 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | external/maxcore/artifacts/ai-training-server/workers/seed_audio_dataset.py:142 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | external/maxcore/artifacts/ai-training-server/workers/seed_audio_dataset.py:160 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P1 | typescript.react.security.react-insecure-request.react-insecure-request | external/pdim/.replit_integration_files/server/replit_integrations/object_storage/objectStorage.ts:278 | CWE-319: Cleartext Transmission of Sensitive Information |
| P1 | typescript.react.security.react-insecure-request.react-insecure-request | external/pdim/artifacts/api-server/src/pocket-dimension/fabric/storage/ReplitChunkStore.ts:24 | CWE-319: Cleartext Transmission of Sensitive Information |
| P1 | typescript.react.security.react-insecure-request.react-insecure-request | external/pdim/artifacts/api-server/src/services/hybridStorageService.ts:88 | CWE-319: Cleartext Transmission of Sensitive Information |
| P1 | typescript.react.security.react-insecure-request.react-insecure-request | external/pdim/artifacts/api-server/src/services/storageService.ts:122 | CWE-319: Cleartext Transmission of Sensitive Information |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | scripts/poll_chart_topper.py:50 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | scripts/poll_chart_topper.py:142 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P1 | javascript.lang.security.detect-child-process.detect-child-process | server/services/advancedVideoRendererService.ts:562 | CWE-78: Improper Neutralization of Special Elements used in an OS Command ('OS Command Injection') |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | server/services/ai_content_sidecar.py:112 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | server/services/ai_content_sidecar.py:130 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P1 | javascript.lang.security.detect-child-process.detect-child-process | server/services/backup/databaseBackupService.ts:212 | CWE-78: Improper Neutralization of Special Elements used in an OS Command ('OS Command Injection') |
| P2 | python.lang.security.insecure-hash-algorithms.insecure-hash-algorithm-sha1 | server/services/diffusion/advanced_memory.py:333 | CWE-327: Use of a Broken or Risky Cryptographic Algorithm |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | server/services/diffusion/api_server_v4.py:549 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | server/services/diffusion/api_server_v4.py:937 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | server/services/diffusion/api_server_v4.py:1350 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | server/services/diffusion/api_server_v4.py:1465 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | server/services/diffusion/dataset_reader.py:354 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | server/services/diffusion/gen_engine_v2/audio_synth_v2.py:839 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | server/services/diffusion/gen_engine_v2/audio_synth_v2.py:864 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | server/services/diffusion/gen_engine_v2/audio_synth_v2.py:900 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | server/services/diffusion/gen_engine_v2/ltx_adapter.py:160 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | server/services/diffusion/gen_engine_v2/ltx_adapter.py:180 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | server/services/diffusion/gen_engine_v2/ltx_adapter.py:214 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | server/services/diffusion/maxcore_dataset_bridge.py:100 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | server/services/diffusion/maxcore_dataset_bridge.py:144 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P1 | typescript.react.security.react-insecure-request.react-insecure-request | tests/integration/maxcore-local-supervisor.integration.test.ts:27 | CWE-319: Cleartext Transmission of Sensitive Information |
| P1 | typescript.react.security.react-insecure-request.react-insecure-request | tests/integration/maxcore-local-supervisor.integration.test.ts:73 | CWE-319: Cleartext Transmission of Sensitive Information |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | video_diffusion/infer/corpus_bridge.py:104 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | video_diffusion/infer/corpus_bridge.py:132 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | video_diffusion/infer/training_bridge.py:80 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | video_diffusion/infer/training_bridge.py:96 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |

## Incompleteness and errors

- Scanner exited nonzero (3).
- 71 scanner/parse error(s) were reported.
- Scanner error (Timeout) at shared/schema.ts: Timeout when running javascript.lang.security.audit.unknown-value-with-script-tag.unknown-value-with-script-tag on <temporary-scan-root>/shared/schema.ts:
 
- Scanner error (PartialParsing) at AI enhancements/ServerVideoGenerator.tsx: Syntax error at line <temporary-scan-root>/AI enhancements/ServerVideoGenerator.tsx:1430:
 `& mood are extracted` was unexpected
- Scanner error (PartialParsing) at AI enhancements/SocialMedia.tsx: Syntax error at line <temporary-scan-root>/AI enhancements/SocialMedia.tsx:1683:
 `& Multi-Platform Publishing` was unexpected
- Scanner error (PartialParsing) at AI enhancements/creativeModelService.ts: Syntax error at line <temporary-scan-root>/AI enhancements/creativeModelService.ts:427:
 `}` was unexpected
- Scanner error (PartialParsing) at client/src/components/CookieConsentBanner.tsx: Syntax error at line <temporary-scan-root>/client/src/components/CookieConsentBanner.tsx:46:
 `& Privacy Notice` was unexpected
- Scanner error (PartialParsing) at client/src/components/a11y/AccessibilityPanel.tsx: Syntax error at line <temporary-scan-root>/client/src/components/a11y/AccessibilityPanel.tsx:103:
 `& Animation` was unexpected
- Scanner error (PartialParsing) at client/src/components/a11y/AccessibilitySettings.tsx: Syntax error at line <temporary-scan-root>/client/src/components/a11y/AccessibilitySettings.tsx:184:
 `& Animation` was unexpected
- Scanner error (PartialParsing) at client/src/components/autonomous/autonomous-dashboard.tsx: Syntax error at line <temporary-scan-root>/client/src/components/autonomous/autonomous-dashboard.tsx:560:
 `& Friendly` was unexpected
- Scanner error (PartialParsing) at client/src/components/collaboration/VersionHistory.tsx: Syntax error at line <temporary-scan-root>/client/src/components/collaboration/VersionHistory.tsx:606:
 `& Restore` was unexpected
- Scanner error (PartialParsing) at client/src/components/content/ServerVideoGenerator.tsx: Syntax error at line <temporary-scan-root>/client/src/components/content/ServerVideoGenerator.tsx:1445:
 `& mood are extracted` was unexpected
- Scanner error (PartialParsing) at client/src/components/dashboard/PersonalizedDashboard.tsx: Syntax error at line <temporary-scan-root>/client/src/components/dashboard/PersonalizedDashboard.tsx:320:
 `& Visibility` was unexpected
- Scanner error (PartialParsing) at client/src/components/distribution/AutoArtistSync.tsx: Syntax error at line <temporary-scan-root>/client/src/components/distribution/AutoArtistSync.tsx:2945:
 `& Begin Discovery` was unexpected
- Scanner error (PartialParsing) at client/src/components/distribution/DataTransferWizard.tsx: Syntax error at line <temporary-scan-root>/client/src/components/distribution/DataTransferWizard.tsx:568:
 `& Profile Sync` was unexpected
- Scanner error (PartialParsing) at client/src/components/distribution/EmbedCodeGenerator.tsx: Syntax error at line <temporary-scan-root>/client/src/components/distribution/EmbedCodeGenerator.tsx:644:
 `& platform targeting` was unexpected
- Scanner error (PartialParsing) at client/src/components/distribution/ISRCManager.tsx: Syntax error at line <temporary-scan-root>/client/src/components/distribution/ISRCManager.tsx:322:
 `& UPC Manager` was unexpected
- Scanner error (PartialParsing) at client/src/components/distribution/MetadataForm.tsx: Syntax error at line <temporary-scan-root>/client/src/components/distribution/MetadataForm.tsx:295:
 `& Publishing` was unexpected
- Scanner error (PartialParsing) at client/src/components/distribution/TakedownManager.tsx: Syntax error at line <temporary-scan-root>/client/src/components/distribution/TakedownManager.tsx:251:
 `& Rights Manager` was unexpected
- Scanner error (PartialParsing) at client/src/components/distribution/TrackUploader.tsx: Syntax error at line <temporary-scan-root>/client/src/components/distribution/TrackUploader.tsx:365:
 `& drop • paste with Ctrl+V` was unexpected
- Scanner error (PartialParsing) at client/src/components/export/ExportDialog.tsx: Syntax error at line <temporary-scan-root>/client/src/components/export/ExportDialog.tsx:829:
 `& Graphs` was unexpected
- Scanner error (PartialParsing) at client/src/components/marketplace/MarketplaceEmptyStates.tsx: Syntax error at line <temporary-scan-root>/client/src/components/marketplace/MarketplaceEmptyStates.tsx:128:
 `& drop audio files` was unexpected
- Scanner error (PartialParsing) at client/src/components/marketplace/ProducerProfile.tsx: Syntax error at line <temporary-scan-root>/client/src/components/marketplace/ProducerProfile.tsx:759:
 `& Software` was unexpected
- Scanner error (PartialParsing) at client/src/components/marketplace/StorefrontBuilder.tsx: Syntax error at line <temporary-scan-root>/client/src/components/marketplace/StorefrontBuilder.tsx:1277:
 `& Fonts` was unexpected
- Scanner error (PartialParsing) at client/src/components/notifications/NotificationPreferences.tsx: Syntax error at line <temporary-scan-root>/client/src/components/notifications/NotificationPreferences.tsx:966:
 `& Security` was unexpected
- Scanner error (PartialParsing) at client/src/components/onboarding/QuickStartWizard.tsx: Syntax error at line <temporary-scan-root>/client/src/components/onboarding/QuickStartWizard.tsx:184:
 `& more` was unexpected
- Scanner error (PartialParsing) at client/src/components/royalties/RoyaltySplitManager.tsx: Syntax error at line <temporary-scan-root>/client/src/components/royalties/RoyaltySplitManager.tsx:261:
 `& Royalty Splits` was unexpected
- Scanner error (PartialParsing) at client/src/components/settings/EmailPreferences.tsx: Syntax error at line <temporary-scan-root>/client/src/components/settings/EmailPreferences.tsx:295:
 `& Tips` was unexpected
- Scanner error (PartialParsing) at client/src/components/settings/PrivacySettings.tsx: Syntax error at line <temporary-scan-root>/client/src/components/settings/PrivacySettings.tsx:356:
 `& Privacy (GDPR)` was unexpected
- Scanner error (PartialParsing) at client/src/components/social/UnifiedCalendar.tsx: Syntax error at line <temporary-scan-root>/client/src/components/social/UnifiedCalendar.tsx:820:
 `& organic content across all platforms` was unexpected
- Scanner error (PartialParsing) at client/src/components/studio/CompingEditor.tsx: Syntax error at line <temporary-scan-root>/client/src/components/studio/CompingEditor.tsx:74:
 `& activate version` was unexpected
- Scanner error (PartialParsing) at client/src/components/studio/DeviceSelector.tsx: Syntax error at line <temporary-scan-root>/client/src/components/studio/DeviceSelector.tsx:112:
 `& MIDI Devices` was unexpected
- Scanner error (PartialParsing) at client/src/components/studio/FileUploadZone.tsx: Syntax error at line <temporary-scan-root>/client/src/components/studio/FileUploadZone.tsx:561:
 `& drop • paste with Ctrl+V` was unexpected
- Scanner error (PartialParsing) at client/src/components/studio/FlowStateAIPanel.tsx: Syntax error at line <temporary-scan-root>/client/src/components/studio/FlowStateAIPanel.tsx:961:
 `& processing` was unexpected
- Scanner error (PartialParsing) at client/src/components/studio/FlowStateChordSuggestions.tsx: Syntax error at line <temporary-scan-root>/client/src/components/studio/FlowStateChordSuggestions.tsx:343:
 `& Scale` was unexpected
- Scanner error (PartialParsing) at client/src/components/studio/MasteringDeliveryPanel.tsx: Syntax error at line <temporary-scan-root>/client/src/components/studio/MasteringDeliveryPanel.tsx:390:
 `& Delivery` was unexpected
- Scanner error (PartialParsing) at client/src/components/studio/MixingMasteringPanel.tsx: Syntax error at line <temporary-scan-root>/client/src/components/studio/MixingMasteringPanel.tsx:279:
 `& Mastering` was unexpected
- Scanner error (PartialParsing) at client/src/components/studio/PluginOutcomes.tsx: Syntax error at line <temporary-scan-root>/client/src/components/studio/PluginOutcomes.tsx:256:
 `& Effects` was unexpected
- Scanner error (PartialParsing) at client/src/components/studio/StudioProjectDialog.tsx: Syntax error at line <temporary-scan-root>/client/src/components/studio/StudioProjectDialog.tsx:602:
 `& drop audio files here, or tap to browse` was unexpected
- Scanner error (PartialParsing) at client/src/components/studio/StudioStartHub.tsx: Syntax error at line <temporary-scan-root>/client/src/components/studio/StudioStartHub.tsx:547:
 `& Tutorials` was unexpected
- Scanner error (PartialParsing) at client/src/components/studio/StudioTopBar.tsx: Syntax error at line <temporary-scan-root>/client/src/components/studio/StudioTopBar.tsx:346:
 `& instruments` was unexpected
- Scanner error (PartialParsing) at client/src/components/studio/TransportBar.tsx: Syntax error at line <temporary-scan-root>/client/src/components/studio/TransportBar.tsx:970:
 `& MIDI will transpose relative to this
                  key` was unexpected
- Scanner error (PartialParsing) at client/src/components/studio/UICustomizer.tsx: Syntax error at line <temporary-scan-root>/client/src/components/studio/UICustomizer.tsx:1452:
 `& Apply` was unexpected
- Scanner error (PartialParsing) at client/src/components/video/CustomizationPanel.tsx: Syntax error at line <temporary-scan-root>/client/src/components/video/CustomizationPanel.tsx:448:
 `& drop or click to browse` was unexpected
- Scanner error (PartialParsing) at client/src/components/workspace/RolePermissionMatrix.tsx: Syntax error at line <temporary-scan-root>/client/src/components/workspace/RolePermissionMatrix.tsx:206:
 `& Permissions` was unexpected
- Scanner error (PartialParsing) at client/src/pages/ARIntelligence.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/ARIntelligence.tsx:163:
 `&R Intelligence` was unexpected
- Scanner error (PartialParsing) at client/src/pages/AdminDashboard.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/AdminDashboard.tsx:379:
 `& Compliance` was unexpected
- Scanner error (PartialParsing) at client/src/pages/Advertisement.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/Advertisement.tsx:3228:
 `& Booking` was unexpected
- Scanner error (PartialParsing) at client/src/pages/Analytics.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/Analytics.tsx:2611:
 `& Regional Hotspots` was unexpected
- Scanner error (PartialParsing) at client/src/pages/Collaborations.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/Collaborations.tsx:769:
 `&B, Afrobeats...` was unexpected
- Scanner error (PartialParsing) at client/src/pages/Contracts.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/Contracts.tsx:1280:
 `& Void Contract` was unexpected
- Scanner error (PartialParsing) at client/src/pages/DesktopApp.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/DesktopApp.tsx:646:
 `& Device
                        Management` was unexpected
- Scanner error (PartialParsing) at client/src/pages/Distribution.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/Distribution.tsx:877:
 `& Tours` was unexpected
- Scanner error (PartialParsing) at client/src/pages/Features.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/Features.tsx:117:
 `& Royalties` was unexpected
- Scanner error (PartialParsing) at client/src/pages/Marketplace.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/Marketplace.tsx:2729:
 `& Sell Beats with Escrow Protection & AI Discovery` was unexpected
- Scanner error (PartialParsing) at client/src/pages/OutreachCRM.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/OutreachCRM.tsx:710:
 `&B, …` was unexpected
- Scanner error (PartialParsing) at client/src/pages/PressKit.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/PressKit.tsx:349:
 `& Contact` was unexpected
- Scanner error (PartialParsing) at client/src/pages/Pricing.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/Pricing.tsx:225:
 `& advertising,
            marketplace, analytics, and distribution.` was unexpected
- Scanner error (PartialParsing) at client/src/pages/Projects.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/Projects.tsx:601:
 `&b` was unexpected
- Scanner error (PartialParsing) at client/src/pages/PublicPressKit.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/PublicPressKit.tsx:217:
 `& Booking` was unexpected
- Scanner error (PartialParsing) at client/src/pages/Register.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/Register.tsx:437:
 `& Deezer.` was unexpected
- Scanner error (PartialParsing) at client/src/pages/Royalties.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/Royalties.tsx:1040:
 `& Revenue` was unexpected
- Scanner error (PartialParsing) at client/src/pages/SecurityPage.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/SecurityPage.tsx:36:
 `& Trust` was unexpected
- Scanner error (PartialParsing) at client/src/pages/Settings.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/Settings.tsx:1457:
 `& Subscription` was unexpected
- Scanner error (PartialParsing) at client/src/pages/Shows.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/Shows.tsx:240:
 `& Tour` was unexpected
- Scanner error (PartialParsing) at client/src/pages/SocialMedia.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/SocialMedia.tsx:1758:
 `& Multi-Platform Publishing` was unexpected
- Scanner error (PartialParsing) at client/src/pages/SyncLicensing.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/SyncLicensing.tsx:222:
 `& Ads` was unexpected
- Scanner error (PartialParsing) at client/src/pages/analytics/ARDiscoveryPanel.tsx: Syntax error at line <temporary-scan-root>/client/src/pages/analytics/ARDiscoveryPanel.tsx:357:
 `&R Discovery Panel` was unexpected
- Scanner error (PartialParsing) at external/maxcore/artifacts/ai-dashboard/src/pages/artist-settings.tsx: Syntax error at line <temporary-scan-root>/external/maxcore/artifacts/ai-dashboard/src/pages/artist-settings.tsx:487:
 `&
                preview` was unexpected
- Scanner error (PartialParsing) at external/maxcore/artifacts/ai-dashboard/src/pages/campaign-calendar.tsx: Syntax error at line <temporary-scan-root>/external/maxcore/artifacts/ai-dashboard/src/pages/campaign-calendar.tsx:430:
 `& save calendar` was unexpected
- Scanner error (PartialParsing) at external/maxcore/artifacts/ai-dashboard/src/pages/url-inspector.tsx: Syntax error at line <temporary-scan-root>/external/maxcore/artifacts/ai-dashboard/src/pages/url-inspector.tsx:249:
 `& parsing URL…` was unexpected
- Scanner error (PartialParsing) at external/pdim/artifacts/api-server/src/redis/store.ts: Syntax error at line <temporary-scan-root>/external/pdim/artifacts/api-server/src/redis/store.ts:3298:
 `import("./types.js").StreamItem` was unexpected
- Scanner error (PartialParsing) at server/routes/search.ts: Syntax error at line <temporary-scan-root>/server/routes/search.ts:171:
 `=` was unexpected

Every finding requires source-level validation. Prioritize ERROR findings at exposed trust boundaries, then WARNING findings involving command execution, path traversal, injection, authorization, cryptography, or credential handling.
