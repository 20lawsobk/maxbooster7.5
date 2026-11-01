# SAST parser-error resolution

Baseline: `reports/readiness-implementation/sast-resumed-full.json`

## Result

- All 70 baseline `PartialParsing` errors were remediated in source.
- The baseline `Timeout` for `shared/schema.ts` was not owned by this work and that file was not changed.
- No suppression, scanner exclusion, or ignore directive was added.
- JSX text ampersands were encoded as `&amp;`, which React renders as the same `&` character. Ampersands in attribute/string values were not entity-encoded; affected quoted JSX attributes were changed to equivalent string expressions.
- Inline TypeScript `import()` type queries that the security-rules scan could not fully parse were replaced with semantically equivalent static type-only imports (or the existing `SQL` import).
- The first focused security-rules scan exposed additional ampersands later in 14 already-owned files after their baseline first parse error was removed. Those cascaded parse errors were remediated by the same rules so each owned file parses completely.

Disposition codes:

- **A** — Resolved by encoding a literal ampersand in JSX text; rendered text is unchanged.
- **B** — Resolved by changing a quoted JSX attribute to an equivalent JSX string expression; runtime value is unchanged. Where the same element also had JSX child text, only that child text uses `&amp;`.
- **C** — Resolved by replacing inline `import()` type queries with equivalent static type-only imports.
- **D** — Resolved by using the already imported `SQL` type.
- **N/O** — Not owned under the explicit scope; unchanged.

## Original error dispositions

| # | Baseline type | Baseline location | Disposition |
|---:|---|---|---|
| 1 | `Timeout` | `shared/schema.ts` | **N/O** — Explicitly excluded timeout; unchanged. |
| 2 | `PartialParsing` | `AI enhancements/ServerVideoGenerator.tsx:1430` | **A** |
| 3 | `PartialParsing` | `AI enhancements/SocialMedia.tsx:1683` | **A** |
| 4 | `PartialParsing` | `AI enhancements/creativeModelService.ts:427` | **C** |
| 5 | `PartialParsing` | `client/src/components/CookieConsentBanner.tsx:46` | **A** |
| 6 | `PartialParsing` | `client/src/components/a11y/AccessibilityPanel.tsx:103` | **A** |
| 7 | `PartialParsing` | `client/src/components/a11y/AccessibilitySettings.tsx:184` | **A** |
| 8 | `PartialParsing` | `client/src/components/autonomous/autonomous-dashboard.tsx:560` | **A** |
| 9 | `PartialParsing` | `client/src/components/collaboration/VersionHistory.tsx:606` | **A** |
| 10 | `PartialParsing` | `client/src/components/content/ServerVideoGenerator.tsx:1445` | **A** |
| 11 | `PartialParsing` | `client/src/components/dashboard/PersonalizedDashboard.tsx:320` | **A** |
| 12 | `PartialParsing` | `client/src/components/distribution/AutoArtistSync.tsx:2945` | **A** |
| 13 | `PartialParsing` | `client/src/components/distribution/DataTransferWizard.tsx:568` | **A** |
| 14 | `PartialParsing` | `client/src/components/distribution/EmbedCodeGenerator.tsx:644` | **A** |
| 15 | `PartialParsing` | `client/src/components/distribution/ISRCManager.tsx:322` | **A** |
| 16 | `PartialParsing` | `client/src/components/distribution/MetadataForm.tsx:295` | **A** |
| 17 | `PartialParsing` | `client/src/components/distribution/TakedownManager.tsx:251` | **A** |
| 18 | `PartialParsing` | `client/src/components/distribution/TrackUploader.tsx:365` | **A** |
| 19 | `PartialParsing` | `client/src/components/export/ExportDialog.tsx:829` | **A** |
| 20 | `PartialParsing` | `client/src/components/marketplace/MarketplaceEmptyStates.tsx:128` | **A** |
| 21 | `PartialParsing` | `client/src/components/marketplace/ProducerProfile.tsx:759` | **A** |
| 22 | `PartialParsing` | `client/src/components/marketplace/StorefrontBuilder.tsx:1277` | **A** |
| 23 | `PartialParsing` | `client/src/components/notifications/NotificationPreferences.tsx:966` | **A** |
| 24 | `PartialParsing` | `client/src/components/onboarding/QuickStartWizard.tsx:184` | **A** |
| 25 | `PartialParsing` | `client/src/components/royalties/RoyaltySplitManager.tsx:261` | **A** |
| 26 | `PartialParsing` | `client/src/components/settings/EmailPreferences.tsx:295` | **A** |
| 27 | `PartialParsing` | `client/src/components/settings/PrivacySettings.tsx:356` | **A** |
| 28 | `PartialParsing` | `client/src/components/social/UnifiedCalendar.tsx:820` | **A** |
| 29 | `PartialParsing` | `client/src/components/studio/CompingEditor.tsx:74` | **A** |
| 30 | `PartialParsing` | `client/src/components/studio/DeviceSelector.tsx:112` | **A** |
| 31 | `PartialParsing` | `client/src/components/studio/FileUploadZone.tsx:561` | **A** |
| 32 | `PartialParsing` | `client/src/components/studio/FlowStateAIPanel.tsx:961` | **A** |
| 33 | `PartialParsing` | `client/src/components/studio/FlowStateChordSuggestions.tsx:343` | **A** |
| 34 | `PartialParsing` | `client/src/components/studio/MasteringDeliveryPanel.tsx:390` | **A** |
| 35 | `PartialParsing` | `client/src/components/studio/MixingMasteringPanel.tsx:279` | **A** |
| 36 | `PartialParsing` | `client/src/components/studio/PluginOutcomes.tsx:256` | **A** |
| 37 | `PartialParsing` | `client/src/components/studio/StudioProjectDialog.tsx:602` | **A** |
| 38 | `PartialParsing` | `client/src/components/studio/StudioStartHub.tsx:547` | **A** |
| 39 | `PartialParsing` | `client/src/components/studio/StudioTopBar.tsx:346` | **A** |
| 40 | `PartialParsing` | `client/src/components/studio/TransportBar.tsx:970` | **A** |
| 41 | `PartialParsing` | `client/src/components/studio/UICustomizer.tsx:1452` | **A** |
| 42 | `PartialParsing` | `client/src/components/video/CustomizationPanel.tsx:448` | **A** |
| 43 | `PartialParsing` | `client/src/components/workspace/RolePermissionMatrix.tsx:206` | **A** |
| 44 | `PartialParsing` | `client/src/pages/ARIntelligence.tsx:163` | **A** |
| 45 | `PartialParsing` | `client/src/pages/AdminDashboard.tsx:379` | **A** |
| 46 | `PartialParsing` | `client/src/pages/Advertisement.tsx:3228` | **A** |
| 47 | `PartialParsing` | `client/src/pages/Analytics.tsx:2611` | **A** |
| 48 | `PartialParsing` | `client/src/pages/Collaborations.tsx:769` | **B** |
| 49 | `PartialParsing` | `client/src/pages/Contracts.tsx:1280` | **A** |
| 50 | `PartialParsing` | `client/src/pages/DesktopApp.tsx:646` | **A** |
| 51 | `PartialParsing` | `client/src/pages/Distribution.tsx:877` | **A** |
| 52 | `PartialParsing` | `client/src/pages/Features.tsx:117` | **A** |
| 53 | `PartialParsing` | `client/src/pages/Marketplace.tsx:2729` | **A** |
| 54 | `PartialParsing` | `client/src/pages/OutreachCRM.tsx:710` | **B** |
| 55 | `PartialParsing` | `client/src/pages/PressKit.tsx:349` | **A** |
| 56 | `PartialParsing` | `client/src/pages/Pricing.tsx:225` | **A** |
| 57 | `PartialParsing` | `client/src/pages/Projects.tsx:601` | **B** |
| 58 | `PartialParsing` | `client/src/pages/PublicPressKit.tsx:217` | **A** |
| 59 | `PartialParsing` | `client/src/pages/Register.tsx:437` | **A** |
| 60 | `PartialParsing` | `client/src/pages/Royalties.tsx:1040` | **A** |
| 61 | `PartialParsing` | `client/src/pages/SecurityPage.tsx:36` | **A** |
| 62 | `PartialParsing` | `client/src/pages/Settings.tsx:1457` | **A** |
| 63 | `PartialParsing` | `client/src/pages/Shows.tsx:240` | **A** |
| 64 | `PartialParsing` | `client/src/pages/SocialMedia.tsx:1758` | **A** |
| 65 | `PartialParsing` | `client/src/pages/SyncLicensing.tsx:222` | **A** |
| 66 | `PartialParsing` | `client/src/pages/analytics/ARDiscoveryPanel.tsx:357` | **A** |
| 67 | `PartialParsing` | `external/maxcore/artifacts/ai-dashboard/src/pages/artist-settings.tsx:487` | **A** |
| 68 | `PartialParsing` | `external/maxcore/artifacts/ai-dashboard/src/pages/campaign-calendar.tsx:430` | **A** |
| 69 | `PartialParsing` | `external/maxcore/artifacts/ai-dashboard/src/pages/url-inspector.tsx:249` | **A** |
| 70 | `PartialParsing` | `external/pdim/artifacts/api-server/src/redis/store.ts:3298` | **C** |
| 71 | `PartialParsing` | `server/routes/search.ts:171` | **D** |

## Verification

1. Focused Semgrep scan of the exact 70 baseline `PartialParsing` paths with installed Semgrep `1.172.0` and the baseline `p/security-audit` rules artifact:
   - rules SHA-256: `b109a039df712f30c6d3e25e1e8358053fd0f1c91b92d0e8d2871cd141fe602f`
   - 225 configured rules; 22 applicable rules run
   - 70 targets scanned
   - parsed lines: approximately 100%
   - scanner errors: 0
   - exit status: 0
2. TypeScript `createSourceFile` parse and `transpileModule` transform over the same exact 70 paths:
   - targets checked: 70
   - parse/transform failures: 0
3. `git diff --check` completed successfully.

No full-repository TypeScript check, workflow, server, or live operation was run.