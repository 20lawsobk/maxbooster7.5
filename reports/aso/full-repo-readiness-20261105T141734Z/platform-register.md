# Platform feature and coverage register

**Gate: UNVERIFIED.** All required checks need exact current passing-case links, resolved mappings and actual execution coverage; static source matches do not close feature acceptance.

This source register and the machine JSON distinguish declarations, static associations, actual line/function execution and explicit behavioral acceptance. No source match or page render is promoted to full feature verification.

| Surface | Count |
| --- | ---: |
| routedPageDeclarations | 80 |
| uiInteractionDeclarations | 8412 |
| backendRegistrations | 9377 |
| frontendApiContracts | 932 |
| scannedTypeScriptJavaScriptFiles | 5699 |
| actualCoverageFiles | 2661 |
| requiredChecks | 70168 |
| unverifiedChecks | 70168 |
| unknownMappings | 6405 |
| invalidEvidenceLinks | 9 |

## Routed pages

Each row links to its source and names the next test to add. The JSON retains every exact required-check ID, reachable source file, UI control, API call and candidate test association.

| Route | Component/source | Direct controls | API calls | Candidate tests | Acceptance | Next test |
| --- | --- | ---: | ---: | ---: | --- | --- |
| `/` | `Landing` — `client/src/pages/Landing.tsx:1` | 33 | 8 | 0 static candidates | UNVERIFIED | `tests/browser/landing-acceptance.test.mjs` |
| `/login` | `Login` — `client/src/pages/Login.tsx:1` | 15 | 7 | 0 static candidates | UNVERIFIED | `tests/browser/login-acceptance.test.mjs` |
| `/forgot-password` | `ForgotPassword` — `client/src/pages/ForgotPassword.tsx:1` | 11 | 1 | 0 static candidates | UNVERIFIED | `tests/browser/forgot-password-acceptance.test.mjs` |
| `/reset-password` | `ResetPassword` — `client/src/pages/ResetPassword.tsx:1` | 19 | 1 | 0 static candidates | UNVERIFIED | `tests/browser/reset-password-acceptance.test.mjs` |
| `/register` | `Register` — `client/src/pages/Register.tsx:1` | 19 | 8 | 3 static candidates | UNVERIFIED | `tests/browser/register-acceptance.test.mjs` |
| `/register/payment/:tier` | `RegisterPayment` — `client/src/pages/RegisterPayment.tsx:1` | 19 | 0 | 4 static candidates | UNVERIFIED | `tests/browser/register-payment-tier-acceptance.test.mjs` |
| `/register/success` | `RegisterSuccess` — `client/src/pages/RegisterSuccess.tsx:1` | 19 | 8 | 0 static candidates | UNVERIFIED | `tests/browser/register-success-acceptance.test.mjs` |
| `/dashboard` | `Dashboard` — `client/src/pages/Dashboard.tsx:1` | 148 | 34 | 5 static candidates | UNVERIFIED | `tests/browser/dashboard-acceptance.test.mjs` |
| `/simplified-dashboard` | `SimplifiedDashboard` — `client/src/pages/SimplifiedDashboard.tsx:1` | 53 | 15 | 2 static candidates | UNVERIFIED | `tests/browser/simplified-dashboard-acceptance.test.mjs` |
| `/projects` | `Projects` — `client/src/pages/Projects.tsx:1` | 0 | 0 | 3 static candidates | UNVERIFIED | `tests/browser/projects-acceptance.test.mjs` |
| `/desktop-app` | `DesktopApp` — `client/src/pages/DesktopApp.tsx:1` | 0 | 0 | 2 static candidates | UNVERIFIED | `tests/browser/desktop-app-acceptance.test.mjs` |
| `/analytics/ai` | `AIDashboard` — `client/src/pages/analytics/AIDashboard.tsx:1` | 49 | 14 | 0 static candidates | UNVERIFIED | `tests/browser/analytics-ai-acceptance.test.mjs` |
| `/analytics` | `Analytics` — `client/src/pages/Analytics.tsx:1` | 196 | 30 | 3 static candidates | UNVERIFIED | `tests/browser/analytics-acceptance.test.mjs` |
| `/developer-api` | `DeveloperApi` — `client/src/pages/DeveloperApi.tsx:1` | 72 | 17 | 1 static candidates | UNVERIFIED | `tests/browser/developer-api-acceptance.test.mjs` |
| `/social-media` | `SocialMedia` — `client/src/pages/SocialMedia.tsx:1` | 534 | 61 | 7 static candidates | UNVERIFIED | `tests/browser/social-media-acceptance.test.mjs` |
| `/advertising` | `Advertisement` — `client/src/pages/Advertisement.tsx:1` | 296 | 39 | 2 static candidates | UNVERIFIED | `tests/browser/advertising-acceptance.test.mjs` |
| `/marketplace` | `Marketplace` — `client/src/pages/Marketplace.tsx:1` | 595 | 46 | 4 static candidates | UNVERIFIED | `tests/browser/marketplace-acceptance.test.mjs` |
| `/marketplace/beat/:beatId` | `Marketplace` — `client/src/pages/Marketplace.tsx:1` | 595 | 46 | 4 static candidates | UNVERIFIED | `tests/browser/marketplace-beat-beatid-acceptance.test.mjs` |
| `/marketplace/producer/:producerId` | `ProducerProfilePage` — `client/src/pages/ProducerProfilePage.tsx:1` | 70 | 18 | 0 static candidates | UNVERIFIED | `tests/browser/marketplace-producer-producerid-acceptance.test.mjs` |
| `/royalties` | `Royalties` — `client/src/pages/Royalties.tsx:1` | 130 | 40 | 2 static candidates | UNVERIFIED | `tests/browser/royalties-acceptance.test.mjs` |
| `/studio/:projectId` | `Studio` — `client/src/pages/Studio.tsx:1` | 630 | 85 | 1 static candidates | UNVERIFIED | `tests/browser/studio-projectid-acceptance.test.mjs` |
| `/studio` | `Studio` — `client/src/pages/Studio.tsx:1` | 630 | 85 | 1 static candidates | UNVERIFIED | `tests/browser/studio-acceptance.test.mjs` |
| `/show` | `ShowPage` — `client/src/pages/ShowPage.tsx:1` | 102 | 16 | 0 static candidates | UNVERIFIED | `tests/browser/show-acceptance.test.mjs` |
| `/distribution` | `Distribution` — `client/src/pages/Distribution.tsx:1` | 616 | 120 | 4 static candidates | UNVERIFIED | `tests/browser/distribution-acceptance.test.mjs` |
| `/pricing` | `Pricing` — `client/src/pages/Pricing.tsx:1` | 20 | 0 | 3 static candidates | UNVERIFIED | `tests/browser/pricing-acceptance.test.mjs` |
| `/subscribe/:tier` | `Subscribe` — `client/src/pages/Subscribe.tsx:1` | 22 | 8 | 0 static candidates | UNVERIFIED | `tests/browser/subscribe-tier-acceptance.test.mjs` |
| `/admin/security` | `SecurityDashboard` — `client/src/pages/admin/SecurityDashboard.tsx:1` | 53 | 18 | 0 static candidates | UNVERIFIED | `tests/browser/admin-security-acceptance.test.mjs` |
| `/admin/audit-log` | `AuditLogPage` — `client/src/pages/admin/AuditLog.tsx:1` | 59 | 15 | 0 static candidates | UNVERIFIED | `tests/browser/admin-audit-log-acceptance.test.mjs` |
| `/admin/support/tickets/:ticketId` | `SupportTicketDetail` — `client/src/pages/admin/SupportTicketDetail.tsx:1` | 63 | 17 | 0 static candidates | UNVERIFIED | `tests/browser/admin-support-tickets-ticketid-acceptance.test.mjs` |
| `/admin/support` | `SupportDashboard` — `client/src/pages/admin/SupportDashboard.tsx:1` | 68 | 16 | 0 static candidates | UNVERIFIED | `tests/browser/admin-support-acceptance.test.mjs` |
| `/support/tickets/:ticketId` | `CustomerSupportTicket` — `client/src/pages/SupportTicket.tsx:1` | 51 | 15 | 2 static candidates | UNVERIFIED | `tests/browser/support-tickets-ticketid-acceptance.test.mjs` |
| `/admin/kyc` | `KYCReview` — `client/src/pages/admin/KYCReview.tsx:1` | 25 | 10 | 1 static candidates | UNVERIFIED | `tests/browser/admin-kyc-acceptance.test.mjs` |
| `/admin/training` | `TrainingDashboard` — `client/src/pages/admin/TrainingDashboard.tsx:1` | 60 | 13 | 0 static candidates | UNVERIFIED | `tests/browser/admin-training-acceptance.test.mjs` |
| `/admin/content-sampler` | `ContentSampler` — `client/src/pages/admin/ContentSampler.tsx:1` | 81 | 16 | 0 static candidates | UNVERIFIED | `tests/browser/admin-content-sampler-acceptance.test.mjs` |
| `/admin/dashboard` | `AdminDashboard` — `client/src/pages/AdminDashboard.tsx:1` | 71 | 20 | 1 static candidates | UNVERIFIED | `tests/browser/admin-dashboard-acceptance.test.mjs` |
| `/admin/beat-money-loop` | `AdminDashboard` — `client/src/pages/AdminDashboard.tsx:1` | 71 | 20 | 1 static candidates | UNVERIFIED | `tests/browser/admin-beat-money-loop-acceptance.test.mjs` |
| `/admin` | `Admin` — `client/src/pages/Admin.tsx:1` | 98 | 29 | 0 static candidates | UNVERIFIED | `tests/browser/admin-acceptance.test.mjs` |
| `/settings` | `Settings` — `client/src/pages/Settings.tsx:1` | 256 | 60 | 3 static candidates | UNVERIFIED | `tests/browser/settings-acceptance.test.mjs` |
| `/features` | `Features` — `client/src/pages/Features.tsx:1` | 9 | 0 | 0 static candidates | UNVERIFIED | `tests/browser/features-acceptance.test.mjs` |
| `/api-docs` | `API` — `client/src/pages/API.tsx:1` | 9 | 0 | 0 static candidates | UNVERIFIED | `tests/browser/api-docs-acceptance.test.mjs` |
| `/documentation` | `Documentation` — `client/src/pages/Documentation.tsx:1` | 9 | 0 | 0 static candidates | UNVERIFIED | `tests/browser/documentation-acceptance.test.mjs` |
| `/about` | `About` — `client/src/pages/About.tsx:1` | 7 | 0 | 0 static candidates | UNVERIFIED | `tests/browser/about-acceptance.test.mjs` |
| `/blog` | `Blog` — `client/src/pages/Blog.tsx:1` | 13 | 0 | 0 static candidates | UNVERIFIED | `tests/browser/blog-acceptance.test.mjs` |
| `/blog/:slug` | `BlogPost` — `client/src/pages/BlogPost.tsx:1` | 12 | 0 | 0 static candidates | UNVERIFIED | `tests/browser/blog-slug-acceptance.test.mjs` |
| `/solo-founder-story` | `SoloFounderStory` — `client/src/pages/SoloFounderStory.tsx:1` | 5 | 0 | 0 static candidates | UNVERIFIED | `tests/browser/solo-founder-story-acceptance.test.mjs` |
| `/security` | `SecurityPage` — `client/src/pages/SecurityPage.tsx:1` | 8 | 0 | 0 static candidates | UNVERIFIED | `tests/browser/security-acceptance.test.mjs` |
| `/dmca` | `DMCA` — `client/src/pages/DMCA.tsx:1` | 6 | 0 | 0 static candidates | UNVERIFIED | `tests/browser/dmca-acceptance.test.mjs` |
| `/terms` | `Terms` — `client/src/pages/Terms.tsx:1` | 11 | 0 | 5 static candidates | UNVERIFIED | `tests/browser/terms-acceptance.test.mjs` |
| `/privacy` | `Privacy` — `client/src/pages/Privacy.tsx:1` | 5 | 0 | 1 static candidates | UNVERIFIED | `tests/browser/privacy-acceptance.test.mjs` |
| `/onboarding` | `Onboarding` — `client/src/pages/Onboarding.tsx:1` | 59 | 13 | 1 static candidates | UNVERIFIED | `tests/browser/onboarding-acceptance.test.mjs` |
| `/help` | `Help` — `client/src/pages/Help.tsx:1` | 7 | 0 | 2 static candidates | UNVERIFIED | `tests/browser/help-acceptance.test.mjs` |
| `/storefront` | `Storefront` — `client/src/pages/Storefront.tsx:1` | 28 | 15 | 0 static candidates | UNVERIFIED | `tests/browser/storefront-acceptance.test.mjs` |
| `/storefront/:slug` | `Storefront` — `client/src/pages/Storefront.tsx:1` | 28 | 15 | 0 static candidates | UNVERIFIED | `tests/browser/storefront-slug-acceptance.test.mjs` |
| `/store/:slug` | `Storefront` — `client/src/pages/Storefront.tsx:1` | 28 | 15 | 0 static candidates | UNVERIFIED | `tests/browser/store-slug-acceptance.test.mjs` |
| `/s/:label` | `StorefrontShortLink` — `client/src/App.tsx:265` | 4 | 1 | 1 static candidates | UNVERIFIED | `tests/browser/s-label-acceptance.test.mjs` |
| `/admin/autonomy` | `AdminAutonomy` — `client/src/pages/AdminAutonomy.tsx:1` | 53 | 29 | 0 static candidates | UNVERIFIED | `tests/browser/admin-autonomy-acceptance.test.mjs` |
| `/verification` | `Verification` — `client/src/pages/Verification.tsx:1` | 107 | 17 | 0 static candidates | UNVERIFIED | `tests/browser/verification-acceptance.test.mjs` |
| `/contracts` | `Contracts` — `client/src/pages/Contracts.tsx:1` | 87 | 24 | 1 static candidates | UNVERIFIED | `tests/browser/contracts-acceptance.test.mjs` |
| `/workspaces` | `Workspaces` — `client/src/pages/Workspaces.tsx:1` | 78 | 27 | 1 static candidates | UNVERIFIED | `tests/browser/workspaces-acceptance.test.mjs` |
| `/collaborations` | `Collaborations` — `client/src/pages/Collaborations.tsx:1` | 69 | 14 | 1 static candidates | UNVERIFIED | `tests/browser/collaborations-acceptance.test.mjs` |
| `/career-coach` | `CareerCoach` — `client/src/pages/CareerCoach.tsx:1` | 78 | 18 | 1 static candidates | UNVERIFIED | `tests/browser/career-coach-acceptance.test.mjs` |
| `/assistant` | `Assistant` — `client/src/pages/Assistant.tsx:1` | 57 | 13 | 0 static candidates | UNVERIFIED | `tests/browser/assistant-acceptance.test.mjs` |
| `/release-countdown` | `ReleaseCountdown` — `client/src/pages/ReleaseCountdown.tsx:1` | 63 | 13 | 0 static candidates | UNVERIFIED | `tests/browser/release-countdown-acceptance.test.mjs` |
| `/invoices` | `Invoices` — `client/src/pages/Invoices.tsx:1` | 87 | 18 | 1 static candidates | UNVERIFIED | `tests/browser/invoices-acceptance.test.mjs` |
| `/handle-link` | `HandleLink` — `client/src/pages/HandleLink.tsx:1` | 1 | 0 | 0 static candidates | UNVERIFIED | `tests/browser/handle-link-acceptance.test.mjs` |
| `/notifications/:id` | `NotificationDetail` — `client/src/pages/NotificationDetail.tsx:1` | 54 | 14 | 0 static candidates | UNVERIFIED | `tests/browser/notifications-id-acceptance.test.mjs` |
| `/notifications` | `Notifications` — `client/src/pages/Notifications.tsx:1` | 55 | 13 | 0 static candidates | UNVERIFIED | `tests/browser/notifications-acceptance.test.mjs` |
| `/workflow-automations` | `MusicWorkflowAutomations` — `client/src/pages/MusicWorkflowAutomations.tsx:1` | 92 | 28 | 0 static candidates | UNVERIFIED | `tests/browser/workflow-automations-acceptance.test.mjs` |
| `/shows` | `Shows` — `client/src/pages/Shows.tsx:1` | 95 | 16 | 1 static candidates | UNVERIFIED | `tests/browser/shows-acceptance.test.mjs` |
| `/fan-hub` | `FanHub` — `client/src/pages/FanHub.tsx:1` | 110 | 23 | 0 static candidates | UNVERIFIED | `tests/browser/fan-hub-acceptance.test.mjs` |
| `/fan-memberships` | `FanMemberships` — `client/src/pages/FanMemberships.tsx:1` | 77 | 22 | 0 static candidates | UNVERIFIED | `tests/browser/fan-memberships-acceptance.test.mjs` |
| `/ar-intelligence` | `ARIntelligence` — `client/src/pages/ARIntelligence.tsx:1` | 52 | 16 | 0 static candidates | UNVERIFIED | `tests/browser/ar-intelligence-acceptance.test.mjs` |
| `/outreach` | `OutreachCRM` — `client/src/pages/OutreachCRM.tsx:1` | 81 | 20 | 0 static candidates | UNVERIFIED | `tests/browser/outreach-acceptance.test.mjs` |
| `/merch` | `MerchStore` — `client/src/pages/MerchStore.tsx:1` | 103 | 20 | 1 static candidates | UNVERIFIED | `tests/browser/merch-acceptance.test.mjs` |
| `/press-kit` | `PressKit` — `client/src/pages/PressKit.tsx:1` | 85 | 16 | 0 static candidates | UNVERIFIED | `tests/browser/press-kit-acceptance.test.mjs` |
| `/playlist-pitching` | `PlaylistPitching` — `client/src/pages/PlaylistPitching.tsx:1` | 90 | 16 | 0 static candidates | UNVERIFIED | `tests/browser/playlist-pitching-acceptance.test.mjs` |
| `/publishing` | `Publishing` — `client/src/pages/Publishing.tsx:1` | 89 | 18 | 0 static candidates | UNVERIFIED | `tests/browser/publishing-acceptance.test.mjs` |
| `/sync-licensing` | `SyncLicensing` — `client/src/pages/SyncLicensing.tsx:1` | 79 | 15 | 1 static candidates | UNVERIFIED | `tests/browser/sync-licensing-acceptance.test.mjs` |
| `/epk/:slug` | `PublicPressKit` — `client/src/pages/PublicPressKit.tsx:1` | 10 | 1 | 1 static candidates | UNVERIFIED | `tests/browser/epk-slug-acceptance.test.mjs` |
| `*` | `NotFound` — `client/src/pages/not-found.tsx:1` | 9 | 0 | 0 static candidates | UNVERIFIED | `tests/browser/landing-acceptance.test.mjs` |

## Backend domains

Every method/path registration, source location, mount uncertainty and acceptance requirement is retained in `platform-register.json`. These counts include imported TypeScript/Python services and native service declarations; unresolved mounts are not assumed to be live paths.

| Domain | Registrations | Source files | Checks not closed |
| --- | ---: | ---: | ---: |
| `main-endpoint-audit/.well-known` | 1 | 1 | 5 |
| `main-endpoint-audit/2fa` | 2 | 1 | 11 |
| `main-endpoint-audit/:id` | 3 | 1 | 18 |
| `main-endpoint-audit/achievements` | 7 | 1 | 37 |
| `main-endpoint-audit/adaptive-pricing` | 2 | 1 | 11 |
| `main-endpoint-audit/admin` | 87 | 10 | 488 |
| `main-endpoint-audit/advertising` | 68 | 2 | 368 |
| `main-endpoint-audit/ai` | 30 | 2 | 172 |
| `main-endpoint-audit/analysis` | 2 | 1 | 11 |
| `main-endpoint-audit/analytics` | 24 | 2 | 127 |
| `main-endpoint-audit/analytics-alerts` | 12 | 1 | 66 |
| `main-endpoint-audit/analyze` | 7 | 2 | 44 |
| `main-endpoint-audit/api-docs.json` | 1 | 1 | 5 |
| `main-endpoint-audit/ar-intelligence` | 3 | 1 | 15 |
| `main-endpoint-audit/artist-profiles` | 29 | 1 | 164 |
| `main-endpoint-audit/artist-progress` | 5 | 1 | 26 |
| `main-endpoint-audit/assets` | 2 | 1 | 11 |
| `main-endpoint-audit/assistant` | 3 | 1 | 18 |
| `main-endpoint-audit/audio` | 10 | 2 | 68 |
| `main-endpoint-audit/audio-analysis` | 6 | 1 | 40 |
| `main-endpoint-audit/audio-job` | 1 | 1 | 6 |
| `main-endpoint-audit/audio-processing` | 8 | 1 | 53 |
| `main-endpoint-audit/audit` | 2 | 1 | 11 |
| `main-endpoint-audit/auth` | 84 | 7 | 488 |
| `main-endpoint-audit/auto` | 3 | 1 | 17 |
| `main-endpoint-audit/auto-updates` | 13 | 1 | 72 |
| `main-endpoint-audit/autopilot` | 74 | 6 | 413 |
| `main-endpoint-audit/awareness` | 2 | 1 | 11 |
| `main-endpoint-audit/backup` | 5 | 1 | 27 |
| `main-endpoint-audit/batch` | 29 | 1 | 172 |
| `main-endpoint-audit/billing` | 24 | 1 | 132 |
| `main-endpoint-audit/boot-status` | 1 | 1 | 5 |
| `main-endpoint-audit/bootstrap` | 1 | 1 | 5 |
| `main-endpoint-audit/callback` | 1 | 1 | 6 |
| `main-endpoint-audit/campaigns` | 7 | 1 | 41 |
| `main-endpoint-audit/career-coach` | 13 | 1 | 74 |
| `main-endpoint-audit/certified-analytics` | 17 | 1 | 88 |
| `main-endpoint-audit/clear-all` | 1 | 1 | 7 |
| `main-endpoint-audit/collaboration` | 18 | 1 | 105 |
| `main-endpoint-audit/collaborations` | 14 | 1 | 78 |
| `main-endpoint-audit/content` | 14 | 3 | 91 |
| `main-endpoint-audit/content-analysis` | 8 | 1 | 50 |
| `main-endpoint-audit/contracts` | 51 | 1 | 284 |
| `main-endpoint-audit/countdowns` | 10 | 1 | 57 |
| `main-endpoint-audit/create-checkout-session` | 1 | 1 | 6 |
| `main-endpoint-audit/create-subscription` | 1 | 1 | 6 |
| `main-endpoint-audit/csrf-token` | 1 | 1 | 5 |
| `main-endpoint-audit/custom-workflows` | 9 | 1 | 52 |
| `main-endpoint-audit/dashboard` | 2 | 1 | 10 |
| `main-endpoint-audit/dev` | 1 | 1 | 6 |
| `main-endpoint-audit/developer` | 6 | 1 | 33 |
| `main-endpoint-audit/distribution` | 188 | 2 | 1061 |
| `main-endpoint-audit/dmca` | 11 | 1 | 60 |
| `main-endpoint-audit/dns` | 23 | 1 | 132 |
| `main-endpoint-audit/dns-manager` | 16 | 1 | 93 |
| `main-endpoint-audit/domain-registrar` | 12 | 1 | 66 |
| `main-endpoint-audit/downloads` | 1 | 1 | 5 |
| `main-endpoint-audit/email-preferences` | 4 | 1 | 21 |
| `main-endpoint-audit/emails` | 2 | 1 | 10 |
| `main-endpoint-audit/errors` | 2 | 2 | 12 |
| `main-endpoint-audit/events` | 1 | 1 | 5 |
| `main-endpoint-audit/executive` | 2 | 1 | 11 |
| `main-endpoint-audit/export` | 28 | 2 | 165 |
| `main-endpoint-audit/fabric` | 14 | 1 | 77 |
| `main-endpoint-audit/fan-campaigns` | 7 | 1 | 40 |
| `main-endpoint-audit/fan-hub` | 16 | 1 | 91 |
| `main-endpoint-audit/fan-memberships` | 9 | 1 | 50 |
| `main-endpoint-audit/files` | 15 | 2 | 85 |
| `main-endpoint-audit/generate` | 14 | 2 | 98 |
| `main-endpoint-audit/generate-video` | 2 | 1 | 14 |
| `main-endpoint-audit/generation` | 1 | 1 | 6 |
| `main-endpoint-audit/gpu` | 1 | 1 | 5 |
| `main-endpoint-audit/growth` | 23 | 1 | 135 |
| `main-endpoint-audit/health` | 15 | 7 | 94 |
| `main-endpoint-audit/helpdesk` | 5 | 1 | 28 |
| `main-endpoint-audit/hns` | 11 | 1 | 60 |
| `main-endpoint-audit/hybrid-storage` | 10 | 1 | 56 |
| `main-endpoint-audit/infer` | 2 | 1 | 12 |
| `main-endpoint-audit/infrastructure` | 1 | 1 | 5 |
| `main-endpoint-audit/insights` | 1 | 1 | 5 |
| `main-endpoint-audit/internal` | 2 | 1 | 14 |
| `main-endpoint-audit/invoices` | 10 | 1 | 59 |
| `main-endpoint-audit/kill-switch` | 6 | 1 | 34 |
| `main-endpoint-audit/kyc` | 18 | 1 | 101 |
| `main-endpoint-audit/label-submissions` | 8 | 1 | 46 |
| `main-endpoint-audit/live` | 1 | 1 | 5 |
| `main-endpoint-audit/logs` | 4 | 1 | 21 |
| `main-endpoint-audit/mark-all-read` | 1 | 1 | 6 |
| `main-endpoint-audit/marketplace` | 53 | 1 | 295 |
| `main-endpoint-audit/maxcore` | 23 | 1 | 129 |
| `main-endpoint-audit/maxcore-media` | 1 | 1 | 5 |
| `main-endpoint-audit/memory` | 2 | 1 | 12 |
| `main-endpoint-audit/merch` | 10 | 1 | 56 |
| `main-endpoint-audit/metrics` | 5 | 3 | 27 |
| `main-endpoint-audit/mobile-tokens` | 3 | 1 | 18 |
| `main-endpoint-audit/models` | 4 | 1 | 20 |
| `main-endpoint-audit/monitoring` | 10 | 1 | 55 |
| `main-endpoint-audit/multimodal` | 4 | 1 | 22 |
| `main-endpoint-audit/music-videos` | 12 | 1 | 80 |
| `main-endpoint-audit/music-workflow-automations` | 8 | 1 | 44 |
| `main-endpoint-audit/narrative` | 1 | 1 | 5 |
| `main-endpoint-audit/notifications` | 24 | 1 | 141 |
| `main-endpoint-audit/offline` | 17 | 1 | 97 |
| `main-endpoint-audit/onboarding` | 18 | 1 | 99 |
| `main-endpoint-audit/optimize` | 2 | 1 | 12 |
| `main-endpoint-audit/organic` | 11 | 1 | 58 |
| `main-endpoint-audit/outreach` | 8 | 1 | 47 |
| `main-endpoint-audit/paid` | 2 | 1 | 10 |
| `main-endpoint-audit/payment-bypass` | 1 | 1 | 5 |
| `main-endpoint-audit/payouts` | 32 | 1 | 174 |
| `main-endpoint-audit/personalization` | 35 | 1 | 195 |
| `main-endpoint-audit/ping` | 1 | 1 | 5 |
| `main-endpoint-audit/platform` | 25 | 1 | 156 |
| `main-endpoint-audit/platform-sync` | 12 | 1 | 67 |
| `main-endpoint-audit/playlist-pitching` | 8 | 1 | 45 |
| `main-endpoint-audit/pocket` | 6 | 1 | 32 |
| `main-endpoint-audit/predict` | 2 | 1 | 12 |
| `main-endpoint-audit/preferences` | 16 | 2 | 85 |
| `main-endpoint-audit/press-kit` | 7 | 1 | 40 |
| `main-endpoint-audit/project-budgets` | 9 | 1 | 53 |
| `main-endpoint-audit/projects` | 6 | 1 | 35 |
| `main-endpoint-audit/publishing` | 6 | 1 | 34 |
| `main-endpoint-audit/push` | 4 | 1 | 23 |
| `main-endpoint-audit/push-key` | 1 | 1 | 5 |
| `main-endpoint-audit/push-subscriptions` | 3 | 1 | 18 |
| `main-endpoint-audit/push-test` | 1 | 1 | 6 |
| `main-endpoint-audit/radio-pitches` | 7 | 1 | 40 |
| `main-endpoint-audit/ready` | 5 | 5 | 30 |
| `main-endpoint-audit/readyz` | 1 | 1 | 6 |
| `main-endpoint-audit/register-after-payment` | 1 | 1 | 6 |
| `main-endpoint-audit/retention` | 5 | 1 | 29 |
| `main-endpoint-audit/revenue-forecast` | 6 | 1 | 34 |
| `main-endpoint-audit/robots.txt` | 1 | 1 | 5 |
| `main-endpoint-audit/root` | 4 | 3 | 20 |
| `main-endpoint-audit/royalties` | 20 | 1 | 110 |
| `main-endpoint-audit/s` | 1 | 1 | 5 |
| `main-endpoint-audit/safety` | 2 | 1 | 12 |
| `main-endpoint-audit/sample-clearances` | 6 | 1 | 34 |
| `main-endpoint-audit/search` | 19 | 1 | 104 |
| `main-endpoint-audit/security` | 16 | 3 | 86 |
| `main-endpoint-audit/shortcuts` | 5 | 1 | 28 |
| `main-endpoint-audit/shows` | 14 | 1 | 81 |
| `main-endpoint-audit/simulation` | 17 | 1 | 94 |
| `main-endpoint-audit/sitemap.xml` | 1 | 1 | 5 |
| `main-endpoint-audit/sms` | 4 | 1 | 24 |
| `main-endpoint-audit/social` | 139 | 5 | 789 |
| `main-endpoint-audit/songwriting` | 8 | 1 | 45 |
| `main-endpoint-audit/startup` | 1 | 1 | 5 |
| `main-endpoint-audit/status` | 20 | 4 | 107 |
| `main-endpoint-audit/storage` | 28 | 3 | 161 |
| `main-endpoint-audit/storefront` | 47 | 1 | 270 |
| `main-endpoint-audit/storefront-domains` | 22 | 1 | 124 |
| `main-endpoint-audit/studio` | 225 | 9 | 1315 |
| `main-endpoint-audit/support` | 11 | 1 | 62 |
| `main-endpoint-audit/sync` | 4 | 1 | 23 |
| `main-endpoint-audit/sync-licensing` | 12 | 1 | 69 |
| `main-endpoint-audit/system` | 10 | 1 | 53 |
| `main-endpoint-audit/test` | 1 | 1 | 6 |
| `main-endpoint-audit/testing` | 4 | 1 | 22 |
| `main-endpoint-audit/tiktok` | 2 | 1 | 12 |
| `main-endpoint-audit/tiktok-developers-site-hnfUpA9zyoJspWMdAIdZWXJzIvyo9MBx` | 1 | 1 | 5 |
| `main-endpoint-audit/tiktok-developers-site-verification.txt` | 1 | 1 | 5 |
| `main-endpoint-audit/tiktokShgx3KxJb3b1mCeV8AHEsINRNKf2pmH5.txt` | 1 | 1 | 5 |
| `main-endpoint-audit/tiktokhnfUpA9zyoJspWMdAIdZWXJzIvyo9MBx.txt` | 1 | 1 | 5 |
| `main-endpoint-audit/train` | 5 | 2 | 28 |
| `main-endpoint-audit/training` | 33 | 2 | 187 |
| `main-endpoint-audit/undo` | 16 | 1 | 94 |
| `main-endpoint-audit/unread-count` | 1 | 1 | 5 |
| `main-endpoint-audit/uploads` | 4 | 2 | 24 |
| `main-endpoint-audit/user` | 8 | 2 | 45 |
| `main-endpoint-audit/users` | 3 | 1 | 17 |
| `main-endpoint-audit/v1` | 17 | 1 | 88 |
| `main-endpoint-audit/venues` | 6 | 1 | 34 |
| `main-endpoint-audit/verify-checkout-session` | 1 | 1 | 6 |
| `main-endpoint-audit/version` | 1 | 1 | 5 |
| `main-endpoint-audit/video` | 4 | 1 | 28 |
| `main-endpoint-audit/video-job` | 6 | 1 | 38 |
| `main-endpoint-audit/video-jobs` | 1 | 1 | 6 |
| `main-endpoint-audit/webhooks` | 4 | 3 | 28 |
| `main-endpoint-audit/workspace` | 49 | 1 | 283 |
| `native-source-declaration/.` | 1 | 1 | 3 |
| `native-source-declaration/health` | 1 | 1 | 6 |
| `native-source-declaration/kv` | 7 | 1 | 42 |
| `native-source-declaration/ping` | 1 | 1 | 5 |
| `native-source-declaration/queue` | 2 | 1 | 12 |
| `native-source-declaration/rate` | 1 | 1 | 6 |
| `native-source-declaration/zset` | 4 | 1 | 24 |
| `python-decorator-ast/admin` | 2 | 1 | 12 |
| `python-decorator-ast/analysis` | 5 | 1 | 32 |
| `python-decorator-ast/analytics` | 3 | 1 | 17 |
| `python-decorator-ast/analyze` | 7 | 2 | 44 |
| `python-decorator-ast/api-keys` | 4 | 1 | 24 |
| `python-decorator-ast/audio` | 6 | 1 | 40 |
| `python-decorator-ast/audio-job` | 3 | 2 | 20 |
| `python-decorator-ast/awareness` | 5 | 1 | 27 |
| `python-decorator-ast/boostsheets` | 1 | 1 | 5 |
| `python-decorator-ast/campaigns` | 6 | 1 | 35 |
| `python-decorator-ast/concurrency` | 1 | 1 | 5 |
| `python-decorator-ast/content` | 3 | 2 | 19 |
| `python-decorator-ast/control` | 7 | 1 | 41 |
| `python-decorator-ast/coverage` | 5 | 1 | 26 |
| `python-decorator-ast/dashboard` | 1 | 1 | 5 |
| `python-decorator-ast/dataset` | 1 | 1 | 5 |
| `python-decorator-ast/datasets` | 3 | 1 | 15 |
| `python-decorator-ast/director` | 6 | 1 | 32 |
| `python-decorator-ast/files` | 1 | 1 | 5 |
| `python-decorator-ast/generate` | 16 | 3 | 112 |
| `python-decorator-ast/generate-video` | 2 | 2 | 14 |
| `python-decorator-ast/generation` | 1 | 1 | 6 |
| `python-decorator-ast/gpu` | 10 | 2 | 51 |
| `python-decorator-ast/health` | 4 | 3 | 24 |
| `python-decorator-ast/infer` | 1 | 1 | 6 |
| `python-decorator-ast/knowledge` | 4 | 1 | 21 |
| `python-decorator-ast/maxcore` | 2 | 1 | 11 |
| `python-decorator-ast/memory` | 1 | 1 | 5 |
| `python-decorator-ast/model` | 1 | 1 | 5 |
| `python-decorator-ast/models` | 12 | 2 | 61 |
| `python-decorator-ast/optimize` | 2 | 2 | 12 |
| `python-decorator-ast/platform` | 14 | 1 | 86 |
| `python-decorator-ast/predict` | 2 | 2 | 12 |
| `python-decorator-ast/proxy` | 5 | 1 | 34 |
| `python-decorator-ast/ready` | 3 | 2 | 18 |
| `python-decorator-ast/root` | 1 | 1 | 5 |
| `python-decorator-ast/rta` | 1 | 1 | 5 |
| `python-decorator-ast/safety` | 1 | 1 | 6 |
| `python-decorator-ast/start_download` | 1 | 1 | 6 |
| `python-decorator-ast/start_training` | 1 | 1 | 6 |
| `python-decorator-ast/status` | 2 | 2 | 10 |
| `python-decorator-ast/storage` | 15 | 1 | 83 |
| `python-decorator-ast/sync` | 2 | 1 | 11 |
| `python-decorator-ast/train` | 10 | 3 | 57 |
| `python-decorator-ast/training` | 22 | 3 | 121 |
| `python-decorator-ast/url-parser` | 2 | 1 | 10 |
| `python-decorator-ast/video` | 2 | 1 | 14 |
| `python-decorator-ast/video-job` | 6 | 1 | 38 |
| `python-decorator-ast/video-jobs` | 1 | 1 | 6 |
| `python-decorator-ast/warm` | 2 | 1 | 11 |
| `python-decorator-ast/watchdog` | 3 | 1 | 16 |
| `typescript-router-ast/*path` | 2 | 2 | 10 |
| `typescript-router-ast/.well-known` | 4 | 4 | 20 |
| `typescript-router-ast/3ds` | 4 | 4 | 24 |
| `typescript-router-ast/:accountId` | 3 | 1 | 19 |
| `typescript-router-ast/:batchId` | 4 | 4 | 28 |
| `typescript-router-ast/:contractId` | 36 | 4 | 200 |
| `typescript-router-ast/:id` | 452 | 70 | 2656 |
| `typescript-router-ast/:invoiceId` | 20 | 4 | 112 |
| `typescript-router-ast/:keyId` | 2 | 1 | 14 |
| `typescript-router-ast/:postId` | 20 | 4 | 120 |
| `typescript-router-ast/:slug` | 5 | 5 | 25 |
| `typescript-router-ast/:storefrontId` | 153 | 9 | 908 |
| `typescript-router-ast/:templateId` | 3 | 1 | 18 |
| `typescript-router-ast/:type` | 4 | 4 | 20 |
| `typescript-router-ast/<computed>` | 13 | 6 | 71 |
| `typescript-router-ast/ab-tests` | 5 | 5 | 25 |
| `typescript-router-ast/accept` | 1 | 1 | 6 |
| `typescript-router-ast/access` | 12 | 4 | 68 |
| `typescript-router-ast/accessibility-preferences` | 20 | 5 | 115 |
| `typescript-router-ast/achievements` | 5 | 5 | 25 |
| `typescript-router-ast/action` | 2 | 1 | 11 |
| `typescript-router-ast/activate` | 6 | 6 | 36 |
| `typescript-router-ast/activate-persist-validation` | 4 | 4 | 24 |
| `typescript-router-ast/activity` | 13 | 13 | 65 |
| `typescript-router-ast/admin` | 61 | 17 | 346 |
| `typescript-router-ast/ads` | 5 | 5 | 30 |
| `typescript-router-ast/affiliates` | 8 | 4 | 44 |
| `typescript-router-ast/ai` | 20 | 4 | 104 |
| `typescript-router-ast/ai-assist` | 4 | 4 | 24 |
| `typescript-router-ast/ai-content` | 24 | 4 | 132 |
| `typescript-router-ast/ai-insights` | 10 | 10 | 50 |
| `typescript-router-ast/ai-jobs` | 2 | 2 | 12 |
| `typescript-router-ast/ai-master` | 5 | 5 | 30 |
| `typescript-router-ast/ai-mix` | 5 | 5 | 30 |
| `typescript-router-ast/ai-music` | 25 | 5 | 140 |
| `typescript-router-ast/ai-recommendations` | 4 | 4 | 20 |
| `typescript-router-ast/alerts` | 28 | 7 | 153 |
| `typescript-router-ast/algorithm-health` | 8 | 4 | 52 |
| `typescript-router-ast/algorithm-insights` | 12 | 8 | 60 |
| `typescript-router-ast/analysis` | 2 | 2 | 12 |
| `typescript-router-ast/analysis-features` | 4 | 4 | 20 |
| `typescript-router-ast/analytics` | 33 | 29 | 175 |
| `typescript-router-ast/analyze` | 10 | 6 | 62 |
| `typescript-router-ast/analyze-audio` | 5 | 5 | 35 |
| `typescript-router-ast/analyze-audio-beats` | 5 | 5 | 35 |
| `typescript-router-ast/analyze-file` | 4 | 4 | 24 |
| `typescript-router-ast/analyze-image` | 5 | 5 | 35 |
| `typescript-router-ast/analyze-reference-voice` | 5 | 5 | 30 |
| `typescript-router-ast/analyze-url` | 5 | 5 | 30 |
| `typescript-router-ast/anomalies` | 5 | 5 | 25 |
| `typescript-router-ast/anomaly-detection` | 1 | 1 | 5 |
| `typescript-router-ast/api-keys` | 8 | 2 | 48 |
| `typescript-router-ast/apply-defaults` | 4 | 4 | 24 |
| `typescript-router-ast/apply-insight` | 4 | 4 | 24 |
| `typescript-router-ast/apply-schedule` | 4 | 4 | 24 |
| `typescript-router-ast/apply-suggested-priorities` | 4 | 4 | 24 |
| `typescript-router-ast/ar-discovery` | 8 | 8 | 44 |
| `typescript-router-ast/arpeggiate` | 1 | 1 | 6 |
| `typescript-router-ast/artwork` | 4 | 4 | 24 |
| `typescript-router-ast/attribution` | 10 | 5 | 50 |
| `typescript-router-ast/auctions` | 28 | 4 | 160 |
| `typescript-router-ast/audience-patterns` | 4 | 4 | 24 |
| `typescript-router-ast/audience-segments` | 5 | 5 | 25 |
| `typescript-router-ast/audio` | 27 | 15 | 181 |
| `typescript-router-ast/audio-job` | 2 | 2 | 12 |
| `typescript-router-ast/audio-to-melody` | 4 | 4 | 28 |
| `typescript-router-ast/audit-log` | 4 | 4 | 20 |
| `typescript-router-ast/auth` | 4 | 4 | 20 |
| `typescript-router-ast/autocomplete` | 3 | 3 | 15 |
| `typescript-router-ast/autopush` | 2 | 1 | 11 |
| `typescript-router-ast/awareness` | 6 | 2 | 31 |
| `typescript-router-ast/batch` | 6 | 6 | 36 |
| `typescript-router-ast/batches` | 4 | 4 | 20 |
| `typescript-router-ast/beat-analyze` | 5 | 5 | 30 |
| `typescript-router-ast/beats` | 26 | 9 | 140 |
| `typescript-router-ast/behavior-analysis` | 4 | 4 | 20 |
| `typescript-router-ast/behavioral-alerts` | 1 | 1 | 5 |
| `typescript-router-ast/benchmark` | 15 | 5 | 75 |
| `typescript-router-ast/benchmarks` | 4 | 4 | 20 |
| `typescript-router-ast/bidding-strategies` | 5 | 5 | 25 |
| `typescript-router-ast/blocked-ips` | 2 | 1 | 12 |
| `typescript-router-ast/boostsheets` | 2 | 2 | 10 |
| `typescript-router-ast/boot-status` | 4 | 4 | 20 |
| `typescript-router-ast/bounce` | 8 | 4 | 44 |
| `typescript-router-ast/bulk` | 1 | 1 | 6 |
| `typescript-router-ast/bulk-delete` | 4 | 4 | 24 |
| `typescript-router-ast/bulk-generate` | 4 | 4 | 28 |
| `typescript-router-ast/bulk-restore` | 4 | 4 | 24 |
| `typescript-router-ast/business` | 4 | 4 | 24 |
| `typescript-router-ast/by-release` | 1 | 1 | 5 |
| `typescript-router-ast/cache` | 6 | 1 | 35 |
| `typescript-router-ast/calendar` | 45 | 5 | 270 |
| `typescript-router-ast/callback` | 4 | 4 | 24 |
| `typescript-router-ast/campaigns` | 22 | 7 | 125 |
| `typescript-router-ast/cancel-subscription` | 4 | 4 | 24 |
| `typescript-router-ast/cancellation-feedback` | 4 | 4 | 24 |
| `typescript-router-ast/capabilities` | 5 | 5 | 25 |
| `typescript-router-ast/catalog` | 21 | 5 | 109 |
| `typescript-router-ast/catalog-export` | 4 | 4 | 24 |
| `typescript-router-ast/chain-fixer` | 12 | 4 | 68 |
| `typescript-router-ast/change` | 1 | 1 | 6 |
| `typescript-router-ast/chart` | 1 | 1 | 6 |
| `typescript-router-ast/chat` | 8 | 8 | 48 |
| `typescript-router-ast/chatbot` | 24 | 4 | 136 |
| `typescript-router-ast/check-domain` | 5 | 5 | 25 |
| `typescript-router-ast/check-first-login` | 5 | 5 | 25 |
| `typescript-router-ast/check-subdomain` | 5 | 5 | 25 |
| `typescript-router-ast/checkout` | 4 | 4 | 24 |
| `typescript-router-ast/chords` | 1 | 1 | 6 |
| `typescript-router-ast/chunk` | 3 | 1 | 18 |
| `typescript-router-ast/churn` | 5 | 5 | 30 |
| `typescript-router-ast/claim` | 4 | 4 | 24 |
| `typescript-router-ast/claims` | 4 | 4 | 20 |
| `typescript-router-ast/cleanup` | 2 | 2 | 12 |
| `typescript-router-ast/clear-all` | 5 | 5 | 35 |
| `typescript-router-ast/clear-all-blocks` | 1 | 1 | 6 |
| `typescript-router-ast/clips` | 55 | 9 | 336 |
| `typescript-router-ast/cluster` | 8 | 4 | 44 |
| `typescript-router-ast/codes` | 20 | 4 | 120 |
| `typescript-router-ast/cohorts` | 12 | 4 | 60 |
| `typescript-router-ast/cohorts{` | 4 | 4 | 20 |
| `typescript-router-ast/collaborations` | 8 | 4 | 44 |
| `typescript-router-ast/comments` | 16 | 4 | 92 |
| `typescript-router-ast/compare-variants` | 4 | 4 | 24 |
| `typescript-router-ast/competitor-insights` | 5 | 5 | 25 |
| `typescript-router-ast/competitor-timing` | 4 | 4 | 20 |
| `typescript-router-ast/competitors` | 15 | 5 | 90 |
| `typescript-router-ast/complete-action` | 4 | 4 | 24 |
| `typescript-router-ast/complete-step` | 5 | 5 | 30 |
| `typescript-router-ast/complete-welcome` | 5 | 5 | 30 |
| `typescript-router-ast/concurrency` | 2 | 2 | 10 |
| `typescript-router-ast/config` | 4 | 4 | 20 |
| `typescript-router-ast/configure` | 9 | 9 | 54 |
| `typescript-router-ast/conflicts` | 5 | 5 | 25 |
| `typescript-router-ast/connect` | 6 | 6 | 36 |
| `typescript-router-ast/connect-desktop` | 4 | 4 | 24 |
| `typescript-router-ast/connect-stripe` | 4 | 4 | 24 |
| `typescript-router-ast/connection-status` | 1 | 1 | 5 |
| `typescript-router-ast/connections` | 12 | 10 | 62 |
| `typescript-router-ast/contacts` | 8 | 4 | 44 |
| `typescript-router-ast/content` | 14 | 7 | 91 |
| `typescript-router-ast/content-id` | 16 | 4 | 104 |
| `typescript-router-ast/contracts` | 20 | 4 | 116 |
| `typescript-router-ast/conversions` | 20 | 5 | 110 |
| `typescript-router-ast/counter` | 4 | 4 | 24 |
| `typescript-router-ast/country-codes` | 4 | 4 | 20 |
| `typescript-router-ast/cover` | 4 | 4 | 20 |
| `typescript-router-ast/create` | 9 | 9 | 54 |
| `typescript-router-ast/create-ab-test` | 4 | 4 | 24 |
| `typescript-router-ast/create-checkout-session` | 4 | 4 | 24 |
| `typescript-router-ast/create-portal-session` | 4 | 4 | 24 |
| `typescript-router-ast/create-restore-point` | 1 | 1 | 6 |
| `typescript-router-ast/creative-fatigue` | 5 | 5 | 25 |
| `typescript-router-ast/creatives` | 5 | 5 | 30 |
| `typescript-router-ast/cross-platform-comparison` | 4 | 4 | 20 |
| `typescript-router-ast/cross-platform{` | 4 | 4 | 20 |
| `typescript-router-ast/curators` | 1 | 1 | 5 |
| `typescript-router-ast/curriculum` | 2 | 2 | 10 |
| `typescript-router-ast/dashboard` | 28 | 23 | 140 |
| `typescript-router-ast/dashboard-layout` | 10 | 5 | 55 |
| `typescript-router-ast/data` | 1 | 1 | 6 |
| `typescript-router-ast/data-sources` | 12 | 4 | 60 |
| `typescript-router-ast/datasets` | 16 | 5 | 85 |
| `typescript-router-ast/deactivate` | 4 | 4 | 24 |
| `typescript-router-ast/decline` | 1 | 1 | 6 |
| `typescript-router-ast/defaults` | 9 | 5 | 49 |
| `typescript-router-ast/delete` | 1 | 1 | 6 |
| `typescript-router-ast/deleted-items` | 1 | 1 | 5 |
| `typescript-router-ast/demographics{` | 8 | 8 | 40 |
| `typescript-router-ast/detect-conflict` | 4 | 4 | 24 |
| `typescript-router-ast/dev` | 4 | 4 | 24 |
| `typescript-router-ast/device` | 16 | 4 | 92 |
| `typescript-router-ast/devices` | 8 | 5 | 48 |
| `typescript-router-ast/diffusion` | 34 | 9 | 195 |
| `typescript-router-ast/disconnect` | 5 | 5 | 30 |
| `typescript-router-ast/disconnect-desktop` | 4 | 4 | 24 |
| `typescript-router-ast/discover` | 3 | 3 | 15 |
| `typescript-router-ast/dismiss-action` | 4 | 4 | 24 |
| `typescript-router-ast/dismiss-insight` | 4 | 4 | 24 |
| `typescript-router-ast/dismiss-reminder` | 5 | 5 | 30 |
| `typescript-router-ast/dispute` | 4 | 4 | 24 |
| `typescript-router-ast/disputes` | 8 | 8 | 40 |
| `typescript-router-ast/distribution` | 3 | 3 | 15 |
| `typescript-router-ast/docs` | 1 | 1 | 5 |
| `typescript-router-ast/document-types` | 4 | 4 | 20 |
| `typescript-router-ast/documents` | 16 | 4 | 92 |
| `typescript-router-ast/download` | 3 | 2 | 15 |
| `typescript-router-ast/download-url` | 1 | 1 | 5 |
| `typescript-router-ast/downloader` | 6 | 2 | 34 |
| `typescript-router-ast/duplicate` | 1 | 1 | 6 |
| `typescript-router-ast/earnings` | 32 | 4 | 168 |
| `typescript-router-ast/email` | 2 | 2 | 10 |
| `typescript-router-ast/email-preferences` | 4 | 1 | 21 |
| `typescript-router-ast/email-verification-status` | 4 | 4 | 20 |
| `typescript-router-ast/emails` | 2 | 1 | 10 |
| `typescript-router-ast/emotions` | 5 | 5 | 30 |
| `typescript-router-ast/end` | 4 | 4 | 24 |
| `typescript-router-ast/engagement-patterns` | 4 | 4 | 20 |
| `typescript-router-ast/engagement{` | 4 | 4 | 20 |
| `typescript-router-ast/errors` | 4 | 4 | 24 |
| `typescript-router-ast/escalate` | 4 | 4 | 24 |
| `typescript-router-ast/escrow` | 8 | 4 | 44 |
| `typescript-router-ast/export` | 21 | 6 | 116 |
| `typescript-router-ast/export-report` | 4 | 4 | 24 |
| `typescript-router-ast/extend` | 4 | 4 | 24 |
| `typescript-router-ast/extend-session` | 4 | 4 | 24 |
| `typescript-router-ast/fabric` | 14 | 1 | 76 |
| `typescript-router-ast/factory-presets` | 4 | 4 | 20 |
| `typescript-router-ast/fanbase` | 60 | 5 | 345 |
| `typescript-router-ast/feature-event` | 4 | 4 | 24 |
| `typescript-router-ast/feature-priority` | 4 | 4 | 24 |
| `typescript-router-ast/feature-usage` | 4 | 4 | 20 |
| `typescript-router-ast/feedback` | 4 | 4 | 24 |
| `typescript-router-ast/file` | 4 | 2 | 24 |
| `typescript-router-ast/files` | 7 | 4 | 39 |
| `typescript-router-ast/filter-presets` | 15 | 3 | 90 |
| `typescript-router-ast/financial-config` | 52 | 8 | 288 |
| `typescript-router-ast/fingerprint` | 16 | 4 | 92 |
| `typescript-router-ast/first-actions` | 5 | 5 | 25 |
| `typescript-router-ast/fit-to-scale` | 1 | 1 | 6 |
| `typescript-router-ast/folders` | 15 | 5 | 95 |
| `typescript-router-ast/follow` | 4 | 4 | 24 |
| `typescript-router-ast/follow-producer` | 4 | 4 | 24 |
| `typescript-router-ast/for-you` | 4 | 4 | 20 |
| `typescript-router-ast/forecast` | 17 | 9 | 94 |
| `typescript-router-ast/forecasts` | 5 | 5 | 25 |
| `typescript-router-ast/forecast{` | 4 | 4 | 20 |
| `typescript-router-ast/formats` | 4 | 4 | 20 |
| `typescript-router-ast/frequency` | 1 | 1 | 6 |
| `typescript-router-ast/generate` | 36 | 21 | 248 |
| `typescript-router-ast/generate-caption-variants` | 4 | 4 | 28 |
| `typescript-router-ast/generate-codes` | 4 | 4 | 28 |
| `typescript-router-ast/generate-content` | 10 | 10 | 70 |
| `typescript-router-ast/generate-from-order` | 4 | 4 | 28 |
| `typescript-router-ast/generate-from-url` | 5 | 5 | 35 |
| `typescript-router-ast/generate-hashtag-sets` | 4 | 4 | 28 |
| `typescript-router-ast/generate-hooks` | 4 | 4 | 28 |
| `typescript-router-ast/generate-image` | 10 | 10 | 70 |
| `typescript-router-ast/generate-insights` | 4 | 4 | 28 |
| `typescript-router-ast/generate-music-video` | 5 | 5 | 35 |
| `typescript-router-ast/generate-slug` | 5 | 5 | 30 |
| `typescript-router-ast/generate-subdomain` | 5 | 5 | 35 |
| `typescript-router-ast/generate-variants` | 8 | 8 | 56 |
| `typescript-router-ast/generate-video` | 12 | 12 | 84 |
| `typescript-router-ast/generation` | 1 | 1 | 6 |
| `typescript-router-ast/genre-templates` | 2 | 1 | 10 |
| `typescript-router-ast/geographic` | 4 | 4 | 20 |
| `typescript-router-ast/global-ranking` | 4 | 4 | 20 |
| `typescript-router-ast/global-ranking{` | 4 | 4 | 20 |
| `typescript-router-ast/gpu` | 19 | 3 | 97 |
| `typescript-router-ast/grace-period-status` | 4 | 4 | 20 |
| `typescript-router-ast/growth-anomalies` | 4 | 4 | 24 |
| `typescript-router-ast/hashtags` | 10 | 10 | 60 |
| `typescript-router-ast/health` | 24 | 22 | 144 |
| `typescript-router-ast/health-score` | 4 | 4 | 24 |
| `typescript-router-ast/health-summary` | 4 | 4 | 24 |
| `typescript-router-ast/healthz` | 5 | 5 | 30 |
| `typescript-router-ast/historical` | 12 | 4 | 60 |
| `typescript-router-ast/historical{` | 4 | 4 | 20 |
| `typescript-router-ast/history` | 37 | 21 | 209 |
| `typescript-router-ast/hybrid` | 10 | 1 | 55 |
| `typescript-router-ast/hyper` | 24 | 4 | 128 |
| `typescript-router-ast/hyperfollow` | 28 | 4 | 160 |
| `typescript-router-ast/identifiers` | 28 | 4 | 168 |
| `typescript-router-ast/image` | 4 | 4 | 28 |
| `typescript-router-ast/import` | 1 | 1 | 6 |
| `typescript-router-ast/inbox` | 45 | 5 | 250 |
| `typescript-router-ast/incidents` | 8 | 4 | 40 |
| `typescript-router-ast/individual` | 4 | 4 | 24 |
| `typescript-router-ast/infer` | 2 | 2 | 12 |
| `typescript-router-ast/info` | 12 | 12 | 60 |
| `typescript-router-ast/initialize` | 4 | 4 | 24 |
| `typescript-router-ast/insights` | 41 | 15 | 221 |
| `typescript-router-ast/instances` | 60 | 8 | 356 |
| `typescript-router-ast/instantiate` | 4 | 4 | 24 |
| `typescript-router-ast/intelligence` | 24 | 4 | 124 |
| `typescript-router-ast/interaction` | 4 | 4 | 24 |
| `typescript-router-ast/interaction-patterns` | 4 | 4 | 20 |
| `typescript-router-ast/internal` | 2 | 2 | 12 |
| `typescript-router-ast/invitations` | 4 | 4 | 24 |
| `typescript-router-ast/invoices` | 32 | 8 | 168 |
| `typescript-router-ast/isrc` | 4 | 4 | 28 |
| `typescript-router-ast/items` | 2 | 1 | 13 |
| `typescript-router-ast/jobs` | 8 | 3 | 44 |
| `typescript-router-ast/keepalive` | 2 | 2 | 10 |
| `typescript-router-ast/keys` | 3 | 1 | 18 |
| `typescript-router-ast/kill` | 4 | 4 | 24 |
| `typescript-router-ast/kill-all` | 4 | 4 | 24 |
| `typescript-router-ast/latest` | 4 | 4 | 20 |
| `typescript-router-ast/layout-presets` | 8 | 4 | 44 |
| `typescript-router-ast/leaderboard` | 1 | 1 | 5 |
| `typescript-router-ast/learn` | 1 | 1 | 6 |
| `typescript-router-ast/learning-insights` | 4 | 4 | 20 |
| `typescript-router-ast/learning-state` | 4 | 4 | 20 |
| `typescript-router-ast/ledger` | 4 | 4 | 20 |
| `typescript-router-ast/legal-holds` | 8 | 4 | 44 |
| `typescript-router-ast/license-templates` | 16 | 4 | 96 |
| `typescript-router-ast/lint` | 4 | 4 | 24 |
| `typescript-router-ast/list` | 4 | 4 | 20 |
| `typescript-router-ast/listening` | 56 | 9 | 296 |
| `typescript-router-ast/listings` | 16 | 4 | 96 |
| `typescript-router-ast/logs` | 5 | 3 | 29 |
| `typescript-router-ast/lookalike-audiences` | 15 | 5 | 85 |
| `typescript-router-ast/loss-history` | 2 | 2 | 10 |
| `typescript-router-ast/lyrics` | 10 | 5 | 55 |
| `typescript-router-ast/lyrics-sync` | 7 | 1 | 40 |
| `typescript-router-ast/maintenance` | 14 | 9 | 75 |
| `typescript-router-ast/manual-token` | 1 | 1 | 6 |
| `typescript-router-ast/mark-all-read` | 5 | 5 | 30 |
| `typescript-router-ast/mark-celebrated` | 5 | 5 | 30 |
| `typescript-router-ast/mark-notified` | 1 | 1 | 6 |
| `typescript-router-ast/markers` | 12 | 6 | 78 |
| `typescript-router-ast/marketplace` | 5 | 4 | 27 |
| `typescript-router-ast/marketplace-disputes` | 36 | 4 | 204 |
| `typescript-router-ast/matrix` | 4 | 4 | 20 |
| `typescript-router-ast/maxcore` | 6 | 4 | 34 |
| `typescript-router-ast/membership-tiers` | 10 | 5 | 65 |
| `typescript-router-ast/memberships` | 10 | 5 | 55 |
| `typescript-router-ast/memory` | 2 | 1 | 12 |
| `typescript-router-ast/message` | 4 | 4 | 24 |
| `typescript-router-ast/messages` | 4 | 4 | 20 |
| `typescript-router-ast/metadata` | 1 | 1 | 5 |
| `typescript-router-ast/metrics` | 33 | 27 | 175 |
| `typescript-router-ast/migrate` | 1 | 1 | 6 |
| `typescript-router-ast/migration` | 4 | 4 | 20 |
| `typescript-router-ast/milestones` | 4 | 4 | 24 |
| `typescript-router-ast/mini-videos` | 3 | 1 | 21 |
| `typescript-router-ast/mix-busses` | 15 | 5 | 95 |
| `typescript-router-ast/mobile-tokens` | 15 | 5 | 90 |
| `typescript-router-ast/model` | 2 | 2 | 10 |
| `typescript-router-ast/models` | 20 | 9 | 100 |
| `typescript-router-ast/moderation` | 32 | 8 | 184 |
| `typescript-router-ast/modulation-matrix` | 12 | 4 | 72 |
| `typescript-router-ast/monitor` | 8 | 1 | 44 |
| `typescript-router-ast/move` | 1 | 1 | 6 |
| `typescript-router-ast/multimodal` | 4 | 2 | 24 |
| `typescript-router-ast/music` | 20 | 4 | 104 |
| `typescript-router-ast/music-video-capabilities` | 5 | 5 | 30 |
| `typescript-router-ast/music-video-job` | 5 | 5 | 30 |
| `typescript-router-ast/my` | 9 | 9 | 45 |
| `typescript-router-ast/my-beats` | 4 | 4 | 20 |
| `typescript-router-ast/my-contracts` | 4 | 4 | 20 |
| `typescript-router-ast/my-domains` | 24 | 4 | 136 |
| `typescript-router-ast/my-posts` | 4 | 4 | 20 |
| `typescript-router-ast/my-stems` | 4 | 4 | 20 |
| `typescript-router-ast/name` | 4 | 4 | 20 |
| `typescript-router-ast/natural-language-query` | 4 | 4 | 24 |
| `typescript-router-ast/next-action` | 4 | 4 | 20 |
| `typescript-router-ast/next-slot` | 1 | 1 | 5 |
| `typescript-router-ast/nlp-query` | 4 | 4 | 24 |
| `typescript-router-ast/nodes` | 8 | 4 | 44 |
| `typescript-router-ast/note-info` | 1 | 1 | 6 |
| `typescript-router-ast/notice` | 4 | 4 | 24 |
| `typescript-router-ast/notices` | 8 | 4 | 40 |
| `typescript-router-ast/notify` | 1 | 1 | 6 |
| `typescript-router-ast/nps` | 4 | 4 | 24 |
| `typescript-router-ast/optimal-schedule` | 4 | 4 | 20 |
| `typescript-router-ast/optimal-times` | 5 | 5 | 25 |
| `typescript-router-ast/optimal-timing` | 8 | 8 | 40 |
| `typescript-router-ast/optimal-timing-all` | 4 | 4 | 20 |
| `typescript-router-ast/optimize` | 3 | 3 | 18 |
| `typescript-router-ast/optimize-campaign` | 5 | 5 | 30 |
| `typescript-router-ast/order` | 4 | 4 | 20 |
| `typescript-router-ast/orders` | 8 | 4 | 44 |
| `typescript-router-ast/organic` | 75 | 10 | 415 |
| `typescript-router-ast/ornament` | 1 | 1 | 6 |
| `typescript-router-ast/overview{` | 4 | 4 | 20 |
| `typescript-router-ast/packages` | 24 | 4 | 132 |
| `typescript-router-ast/pattern` | 36 | 4 | 196 |
| `typescript-router-ast/patterns` | 4 | 4 | 20 |
| `typescript-router-ast/payment-method` | 8 | 4 | 48 |
| `typescript-router-ast/payout-eligibility` | 4 | 4 | 20 |
| `typescript-router-ast/payout-history` | 4 | 4 | 20 |
| `typescript-router-ast/pending` | 4 | 4 | 20 |
| `typescript-router-ast/pentest-results` | 1 | 1 | 5 |
| `typescript-router-ast/performance` | 5 | 5 | 25 |
| `typescript-router-ast/permanent-fixes` | 4 | 4 | 20 |
| `typescript-router-ast/photo` | 2 | 1 | 13 |
| `typescript-router-ast/pinned-folders` | 15 | 5 | 90 |
| `typescript-router-ast/plan` | 4 | 4 | 24 |
| `typescript-router-ast/plans` | 4 | 4 | 20 |
| `typescript-router-ast/platform` | 40 | 6 | 244 |
| `typescript-router-ast/platform-earnings` | 4 | 4 | 20 |
| `typescript-router-ast/platform-fixer` | 32 | 4 | 172 |
| `typescript-router-ast/platform-profile` | 4 | 4 | 20 |
| `typescript-router-ast/platform-recommendations` | 1 | 1 | 5 |
| `typescript-router-ast/platform-stats` | 4 | 4 | 20 |
| `typescript-router-ast/platform-status` | 5 | 5 | 25 |
| `typescript-router-ast/platforms` | 20 | 12 | 104 |
| `typescript-router-ast/playlist-changes` | 4 | 4 | 24 |
| `typescript-router-ast/playlist-journeys` | 8 | 8 | 44 |
| `typescript-router-ast/playlists` | 8 | 4 | 40 |
| `typescript-router-ast/playlists{` | 8 | 8 | 40 |
| `typescript-router-ast/plugins` | 8 | 4 | 40 |
| `typescript-router-ast/pocket` | 4 | 1 | 22 |
| `typescript-router-ast/pockets` | 36 | 4 | 200 |
| `typescript-router-ast/policies` | 8 | 4 | 40 |
| `typescript-router-ast/posting-schedule` | 4 | 4 | 24 |
| `typescript-router-ast/posts` | 15 | 11 | 82 |
| `typescript-router-ast/predict` | 2 | 2 | 12 |
| `typescript-router-ast/predict-engagement` | 4 | 4 | 24 |
| `typescript-router-ast/predict-potential` | 4 | 4 | 24 |
| `typescript-router-ast/preferences` | 18 | 9 | 99 |
| `typescript-router-ast/presave` | 12 | 5 | 70 |
| `typescript-router-ast/presence` | 12 | 4 | 72 |
| `typescript-router-ast/presets` | 24 | 12 | 132 |
| `typescript-router-ast/preview` | 9 | 9 | 49 |
| `typescript-router-ast/process` | 4 | 4 | 24 |
| `typescript-router-ast/producer-analytics` | 4 | 4 | 20 |
| `typescript-router-ast/producers` | 12 | 4 | 60 |
| `typescript-router-ast/profile` | 5 | 5 | 25 |
| `typescript-router-ast/profiles` | 44 | 4 | 256 |
| `typescript-router-ast/progress` | 6 | 6 | 30 |
| `typescript-router-ast/projects` | 304 | 13 | 1750 |
| `typescript-router-ast/promo-cards` | 4 | 1 | 23 |
| `typescript-router-ast/proof` | 1 | 1 | 5 |
| `typescript-router-ast/providers` | 4 | 4 | 20 |
| `typescript-router-ast/provision-wildcard` | 4 | 4 | 24 |
| `typescript-router-ast/public` | 7 | 7 | 35 |
| `typescript-router-ast/publish` | 1 | 1 | 6 |
| `typescript-router-ast/purchase` | 4 | 4 | 24 |
| `typescript-router-ast/purchases` | 8 | 4 | 40 |
| `typescript-router-ast/push` | 20 | 5 | 115 |
| `typescript-router-ast/push-key` | 5 | 5 | 25 |
| `typescript-router-ast/push-subscriptions` | 15 | 5 | 90 |
| `typescript-router-ast/push-test` | 5 | 5 | 30 |
| `typescript-router-ast/qc` | 12 | 4 | 68 |
| `typescript-router-ast/query` | 8 | 4 | 44 |
| `typescript-router-ast/quota` | 1 | 1 | 5 |
| `typescript-router-ast/reach-dashboard` | 4 | 4 | 20 |
| `typescript-router-ast/reactivate-subscription` | 4 | 4 | 24 |
| `typescript-router-ast/ready` | 1 | 1 | 6 |
| `typescript-router-ast/recent-files` | 5 | 5 | 25 |
| `typescript-router-ast/recommend` | 4 | 4 | 24 |
| `typescript-router-ast/recommendations` | 18 | 18 | 95 |
| `typescript-router-ast/recommended-settings` | 4 | 4 | 20 |
| `typescript-router-ast/recommended-step` | 5 | 5 | 25 |
| `typescript-router-ast/record` | 10 | 10 | 60 |
| `typescript-router-ast/recover` | 1 | 1 | 6 |
| `typescript-router-ast/redis` | 8 | 1 | 46 |
| `typescript-router-ast/redo` | 1 | 1 | 6 |
| `typescript-router-ast/refresh` | 4 | 4 | 24 |
| `typescript-router-ast/refresh-token` | 4 | 4 | 24 |
| `typescript-router-ast/refund` | 12 | 4 | 68 |
| `typescript-router-ast/refunds` | 4 | 4 | 20 |
| `typescript-router-ast/register` | 1 | 1 | 6 |
| `typescript-router-ast/register-codes` | 4 | 4 | 24 |
| `typescript-router-ast/reinstatements` | 4 | 4 | 20 |
| `typescript-router-ast/releases` | 92 | 5 | 524 |
| `typescript-router-ast/remote-update` | 2 | 1 | 11 |
| `typescript-router-ast/rename` | 1 | 1 | 6 |
| `typescript-router-ast/report` | 1 | 1 | 6 |
| `typescript-router-ast/reset-defaults` | 4 | 4 | 24 |
| `typescript-router-ast/reset-feature-priorities` | 4 | 4 | 24 |
| `typescript-router-ast/reset-learning` | 4 | 4 | 24 |
| `typescript-router-ast/resolve` | 4 | 4 | 24 |
| `typescript-router-ast/resolve-conflict` | 4 | 4 | 24 |
| `typescript-router-ast/resolver` | 4 | 4 | 20 |
| `typescript-router-ast/restart` | 2 | 2 | 12 |
| `typescript-router-ast/restore` | 2 | 2 | 12 |
| `typescript-router-ast/restore-points` | 2 | 1 | 12 |
| `typescript-router-ast/resume` | 4 | 4 | 24 |
| `typescript-router-ast/resume-all` | 4 | 4 | 24 |
| `typescript-router-ast/retry-payment` | 4 | 4 | 24 |
| `typescript-router-ast/revenue` | 5 | 5 | 30 |
| `typescript-router-ast/revert` | 1 | 1 | 6 |
| `typescript-router-ast/rhyme` | 4 | 4 | 20 |
| `typescript-router-ast/roas` | 20 | 5 | 100 |
| `typescript-router-ast/roles` | 4 | 4 | 20 |
| `typescript-router-ast/root` | 141 | 83 | 768 |
| `typescript-router-ast/royalties` | 32 | 4 | 168 |
| `typescript-router-ast/rta` | 2 | 2 | 10 |
| `typescript-router-ast/s` | 4 | 4 | 20 |
| `typescript-router-ast/safety` | 2 | 2 | 12 |
| `typescript-router-ast/sales-analytics` | 4 | 4 | 20 |
| `typescript-router-ast/samples` | 20 | 5 | 105 |
| `typescript-router-ast/save-features` | 4 | 4 | 24 |
| `typescript-router-ast/scale-sync` | 3 | 1 | 18 |
| `typescript-router-ast/scales` | 2 | 1 | 10 |
| `typescript-router-ast/scan` | 5 | 5 | 30 |
| `typescript-router-ast/schedule` | 39 | 11 | 207 |
| `typescript-router-ast/schedule-export` | 4 | 4 | 24 |
| `typescript-router-ast/schedule-post` | 5 | 5 | 30 |
| `typescript-router-ast/scheduled` | 5 | 5 | 25 |
| `typescript-router-ast/scheduling-suggestions` | 1 | 1 | 5 |
| `typescript-router-ast/score` | 4 | 4 | 24 |
| `typescript-router-ast/score-viral` | 4 | 4 | 24 |
| `typescript-router-ast/search` | 6 | 6 | 30 |
| `typescript-router-ast/security-alerts` | 8 | 4 | 44 |
| `typescript-router-ast/seed` | 5 | 5 | 30 |
| `typescript-router-ast/send-verification-email` | 4 | 4 | 24 |
| `typescript-router-ast/sentiment` | 5 | 5 | 30 |
| `typescript-router-ast/sentry-test` | 8 | 8 | 48 |
| `typescript-router-ast/services` | 12 | 4 | 60 |
| `typescript-router-ast/session` | 2 | 2 | 12 |
| `typescript-router-ast/session-status` | 4 | 4 | 20 |
| `typescript-router-ast/sessions` | 14 | 6 | 86 |
| `typescript-router-ast/settings` | 46 | 9 | 271 |
| `typescript-router-ast/shadowban-check` | 4 | 4 | 24 |
| `typescript-router-ast/share` | 3 | 1 | 16 |
| `typescript-router-ast/share-links` | 4 | 1 | 24 |
| `typescript-router-ast/shutdown` | 2 | 2 | 12 |
| `typescript-router-ast/similar` | 3 | 3 | 15 |
| `typescript-router-ast/simulate-attack` | 1 | 1 | 6 |
| `typescript-router-ast/simulator` | 5 | 5 | 25 |
| `typescript-router-ast/skip` | 5 | 5 | 30 |
| `typescript-router-ast/skip-tutorial` | 5 | 5 | 30 |
| `typescript-router-ast/smart-defaults` | 1 | 1 | 5 |
| `typescript-router-ast/smart-schedule` | 4 | 4 | 20 |
| `typescript-router-ast/sms` | 10 | 5 | 60 |
| `typescript-router-ast/social` | 12 | 12 | 69 |
| `typescript-router-ast/social-token-status` | 4 | 4 | 20 |
| `typescript-router-ast/split-sheets` | 24 | 4 | 136 |
| `typescript-router-ast/spotify-canvas` | 5 | 1 | 30 |
| `typescript-router-ast/start` | 15 | 15 | 90 |
| `typescript-router-ast/start-hub` | 10 | 5 | 50 |
| `typescript-router-ast/stats` | 70 | 70 | 350 |
| `typescript-router-ast/status` | 55 | 51 | 275 |
| `typescript-router-ast/stem-exports` | 5 | 5 | 25 |
| `typescript-router-ast/stems` | 16 | 4 | 92 |
| `typescript-router-ast/stop` | 11 | 11 | 66 |
| `typescript-router-ast/storage` | 30 | 2 | 166 |
| `typescript-router-ast/storage-usage` | 4 | 4 | 20 |
| `typescript-router-ast/strategy` | 32 | 4 | 172 |
| `typescript-router-ast/streaks` | 2 | 1 | 11 |
| `typescript-router-ast/streaming-trends` | 4 | 4 | 20 |
| `typescript-router-ast/streams{` | 8 | 8 | 40 |
| `typescript-router-ast/strikes` | 4 | 4 | 20 |
| `typescript-router-ast/strum` | 1 | 1 | 6 |
| `typescript-router-ast/subdomain` | 5 | 5 | 25 |
| `typescript-router-ast/submit` | 4 | 4 | 24 |
| `typescript-router-ast/subscribe` | 9 | 9 | 54 |
| `typescript-router-ast/subscribers` | 24 | 4 | 144 |
| `typescript-router-ast/subscription` | 4 | 4 | 20 |
| `typescript-router-ast/subscriptions` | 4 | 4 | 24 |
| `typescript-router-ast/suggest-improvements` | 4 | 4 | 24 |
| `typescript-router-ast/suggest-url` | 5 | 5 | 25 |
| `typescript-router-ast/suggestions` | 8 | 8 | 40 |
| `typescript-router-ast/summary` | 12 | 12 | 60 |
| `typescript-router-ast/summary{` | 4 | 4 | 20 |
| `typescript-router-ast/support` | 4 | 4 | 20 |
| `typescript-router-ast/sync` | 13 | 11 | 76 |
| `typescript-router-ast/sync-all` | 10 | 10 | 60 |
| `typescript-router-ast/sync-impact{` | 4 | 4 | 20 |
| `typescript-router-ast/sync-status` | 4 | 4 | 20 |
| `typescript-router-ast/synthesize-voice` | 5 | 5 | 30 |
| `typescript-router-ast/system` | 2 | 2 | 12 |
| `typescript-router-ast/system-health` | 8 | 8 | 48 |
| `typescript-router-ast/takedowns` | 4 | 4 | 20 |
| `typescript-router-ast/tasks` | 5 | 5 | 25 |
| `typescript-router-ast/taste-profile` | 4 | 4 | 20 |
| `typescript-router-ast/tax-form` | 4 | 4 | 24 |
| `typescript-router-ast/tax-forms` | 36 | 4 | 196 |
| `typescript-router-ast/tax-rates` | 4 | 4 | 20 |
| `typescript-router-ast/template-categories` | 5 | 5 | 25 |
| `typescript-router-ast/templates` | 61 | 16 | 351 |
| `typescript-router-ast/test` | 5 | 5 | 30 |
| `typescript-router-ast/text` | 8 | 8 | 48 |
| `typescript-router-ast/threats` | 1 | 1 | 5 |
| `typescript-router-ast/tickets` | 15 | 3 | 81 |
| `typescript-router-ast/tiktok-developers-site-hnfUpA9zyoJspWMdAIdZWXJzIvyo9MBx` | 4 | 4 | 20 |
| `typescript-router-ast/tiktok-developers-site-verification.txt` | 4 | 4 | 20 |
| `typescript-router-ast/tiktokShgx3KxJb3b1mCeV8AHEsINRNKf2pmH5.txt` | 4 | 4 | 20 |
| `typescript-router-ast/tiktokhnfUpA9zyoJspWMdAIdZWXJzIvyo9MBx.txt` | 4 | 4 | 20 |
| `typescript-router-ast/timing-recommendation` | 4 | 4 | 24 |
| `typescript-router-ast/top-content` | 4 | 4 | 20 |
| `typescript-router-ast/toxicity` | 5 | 5 | 30 |
| `typescript-router-ast/track-action` | 1 | 1 | 6 |
| `typescript-router-ast/track-batch` | 4 | 4 | 24 |
| `typescript-router-ast/track-feature` | 4 | 4 | 24 |
| `typescript-router-ast/track-interaction` | 4 | 4 | 24 |
| `typescript-router-ast/track-tutorial` | 5 | 5 | 30 |
| `typescript-router-ast/track-widget-view` | 4 | 4 | 24 |
| `typescript-router-ast/tracks` | 39 | 6 | 234 |
| `typescript-router-ast/tracks{` | 4 | 4 | 20 |
| `typescript-router-ast/train` | 19 | 9 | 110 |
| `typescript-router-ast/training` | 33 | 2 | 183 |
| `typescript-router-ast/transcode` | 4 | 4 | 20 |
| `typescript-router-ast/transcribe` | 4 | 4 | 24 |
| `typescript-router-ast/transfer` | 24 | 4 | 128 |
| `typescript-router-ast/transform` | 1 | 1 | 6 |
| `typescript-router-ast/trash` | 4 | 4 | 20 |
| `typescript-router-ast/trending` | 3 | 3 | 15 |
| `typescript-router-ast/trends` | 5 | 5 | 25 |
| `typescript-router-ast/trigger` | 1 | 1 | 6 |
| `typescript-router-ast/trigger-cities` | 8 | 4 | 40 |
| `typescript-router-ast/tunings` | 1 | 1 | 5 |
| `typescript-router-ast/tutorials` | 5 | 5 | 25 |
| `typescript-router-ast/undo` | 1 | 1 | 6 |
| `typescript-router-ast/unfollow` | 4 | 4 | 24 |
| `typescript-router-ast/unfollow-producer` | 4 | 4 | 24 |
| `typescript-router-ast/unified` | 3 | 3 | 15 |
| `typescript-router-ast/unified-calendar` | 20 | 5 | 100 |
| `typescript-router-ast/unlock-achievement` | 5 | 5 | 30 |
| `typescript-router-ast/unnotified` | 1 | 1 | 5 |
| `typescript-router-ast/unread-count` | 5 | 5 | 25 |
| `typescript-router-ast/unsubscribe` | 4 | 4 | 20 |
| `typescript-router-ast/upc` | 4 | 4 | 28 |
| `typescript-router-ast/update-payment` | 4 | 4 | 24 |
| `typescript-router-ast/upgrade` | 4 | 4 | 24 |
| `typescript-router-ast/upload` | 27 | 20 | 163 |
| `typescript-router-ast/upload-asset` | 5 | 5 | 30 |
| `typescript-router-ast/upload-from-url` | 5 | 5 | 30 |
| `typescript-router-ast/upload-image` | 5 | 5 | 35 |
| `typescript-router-ast/uploads` | 2 | 2 | 10 |
| `typescript-router-ast/url-parser` | 4 | 2 | 20 |
| `typescript-router-ast/usage` | 10 | 9 | 50 |
| `typescript-router-ast/user` | 7 | 6 | 36 |
| `typescript-router-ast/user-statistics` | 5 | 5 | 25 |
| `typescript-router-ast/users` | 60 | 8 | 344 |
| `typescript-router-ast/validate` | 17 | 17 | 102 |
| `typescript-router-ast/validate-code` | 4 | 4 | 24 |
| `typescript-router-ast/variants` | 5 | 5 | 25 |
| `typescript-router-ast/veo-campaign` | 45 | 5 | 250 |
| `typescript-router-ast/veo-url` | 5 | 5 | 30 |
| `typescript-router-ast/verify` | 4 | 4 | 20 |
| `typescript-router-ast/verify-email` | 4 | 4 | 20 |
| `typescript-router-ast/version` | 7 | 5 | 40 |
| `typescript-router-ast/versions` | 16 | 4 | 96 |
| `typescript-router-ast/video` | 8 | 6 | 56 |
| `typescript-router-ast/video-job` | 17 | 7 | 106 |
| `typescript-router-ast/video-jobs` | 2 | 2 | 12 |
| `typescript-router-ast/video-proxy` | 5 | 5 | 30 |
| `typescript-router-ast/video-templates` | 10 | 10 | 60 |
| `typescript-router-ast/viral-content` | 4 | 4 | 24 |
| `typescript-router-ast/viral-score` | 8 | 4 | 44 |
| `typescript-router-ast/voice-profiles` | 5 | 5 | 25 |
| `typescript-router-ast/wallet` | 8 | 4 | 40 |
| `typescript-router-ast/warm` | 4 | 2 | 22 |
| `typescript-router-ast/watchdog` | 6 | 2 | 32 |
| `typescript-router-ast/website` | 4 | 4 | 24 |
| `typescript-router-ast/weekly-stats` | 5 | 5 | 25 |
| `typescript-router-ast/welcome` | 4 | 4 | 20 |
| `typescript-router-ast/whois` | 4 | 4 | 20 |
| `typescript-router-ast/widget` | 4 | 4 | 24 |
| `typescript-router-ast/workflow` | 32 | 4 | 172 |
| `typescript-router-ast/your-stats` | 5 | 5 | 25 |
| `typescript-router-ast/zone` | 4 | 4 | 20 |
| `typescript-router-ast/zones` | 56 | 4 | 332 |

## What to add when a feature is incomplete

1. Locate the page/route/control ID in the JSON and open its exact source location. Use `testCandidates` only to find existing assertions; an import or a matching URL is not behavioral proof.
2. Add a real assertion for each applicable required-check template below. Use the suggested test path and command attached to the subject. Use separate fixture users for access/tenant checks and real disposable storage for durability assertions.
3. Run the scoped suite, retain its case result and source digests, then add an exact entry to the optional acceptance map. The gate accepts a link only when that exact case currently passed and the platform/test source digests still match.
4. For `unknownMappings`, resolve the computed route/mount or runtime-generated UI declaration and add an explicit case; do not silently delete the declaration or lower assertions to close the register.

- **`page-states`:** Exercise this page's actual loading, empty, error/retry and successful states, including navigation and reload.
- **`page-access`:** Verify the page's declared public/authenticated/admin access policy and cross-user resource boundary.
- **`page-persistence`:** Submit applicable page actions, verify the corresponding backend result, and reload to confirm durable state; verify failed writes do not show success.
- **`control-behavior`:** Operate this exact control with real user events; assert the visible result and the intended handler/API request, including disabled and invalid-input behavior.
- **`control-failure`:** Force the control's request/dependency to fail or time out; verify error/retry/cancel behavior and that no unconfirmed success or duplicate mutation is shown.
- **`response-contract`:** Call the exact registered method/path and assert status, content type and response schema for successful, empty and nonexistent-resource cases as applicable.
- **`access-policy`:** Establish and test this endpoint's declared anonymous/authenticated/admin policy; reject unauthorized requests without leaking protected data.
- **`input-boundaries`:** Test actual path/query/body boundaries and malformed or excessive input; assert validation occurs before side effects. Record explicit non-applicability for absent inputs.
- **`tenant-boundary`:** For scoped resources, use distinct fixture identities to prove ownership/tenant isolation on both reads and writes.
- **`dependency-failure`:** Make each required database/storage/provider dependency fail or time out; assert an honest bounded failure and preserve retryable state.
- **`mutation-durability`:** Verify the real mutation with durable readback/reopen, transaction rollback on failure, idempotent retries and concurrent delivery where applicable.
- **`deletion-durability`:** Verify ownership, durable removal and retained/reference cleanup; repeated deletes and interrupted cleanup must not resurrect or erase another user's data.
- **`callback-integrity`:** Verify applicable provider signature/state/nonce, replay and duplicate-event handling against the actual callback handler and stored state.
- **`readiness-truth`:** Prove required child/dependency capability before ready=200; unloaded/unavailable capability must remain unavailable and recover only after actual readiness.
- **`artifact-integrity`:** Validate the delivered artifact's declared format, decode/content constraints, ownership, durable bytes and retry/delivery receipt; distinguish procedural output from learned quality.
- **`dns-wire-contract`:** Exercise actual DNS question/type/record handling, response RCODE/flags/TTL and serialized wire bytes; assert malformed-packet and unsupported-query behavior.

## Actual source execution coverage

Coverage comes from the supplied V8/Istanbul `coverage-final.json`. Uncovered functions and statement lines are available per file in the JSON. A covered line can still have untested roles, inputs, business states and dependency failures.

| Source | Statements hit/total | Functions hit/total | Uncovered functions |
| --- | ---: | ---: | ---: |
| `client/src/pages/Marketplace.tsx` | 256/1561 | 37/572 | 535 |
| `client/src/components/studio/StudioOneDAW.tsx` | 217/1517 | 32/454 | 422 |
| `client/src/lib/studioStore.ts` | 6/551 | 2/356 | 354 |
| `server/routes/distribution.ts` | 194/2627 | 2/323 | 321 |
| `client/src/pages/Distribution.tsx` | 80/706 | 16/307 | 291 |
| `server/storage.ts` | 2/901 | 1/240 | 239 |
| `server/services/artistProfileService.ts` | 7/1210 | 1/239 | 238 |
| `client/src/pages/SocialMedia.tsx` | 116/875 | 14/252 | 238 |
| `server/routes.ts` | 427/2843 | 115/345 | 230 |
| `server/routes/socialMedia.ts` | 106/1859 | 2/220 | 218 |
| `client/src/components/studio/HighPerformanceDAW.tsx` | 0/508 | 0/203 | 203 |
| `client/src/stores/studioStore.ts` | 45/292 | 19/214 | 195 |
| `server/routes/studio.ts` | 117/1855 | 0/188 | 188 |
| `server/lib/pdimClient.ts` | 582/1001 | 99/284 | 185 |
| `shared/ml/models/AdOptimizationEngine.ts` | 0/902 | 0/163 | 163 |
| `client/src/components/marketplace/StorefrontBuilder.tsx` | 86/493 | 3/158 | 155 |
| `external/pdim/artifacts/api-server/src/redis/store.ts` | 1374/3004 | 185/339 | 154 |
| `client/src/components/marketplace/StorefrontDnsZoneManager.tsx` | 8/338 | 0/147 | 147 |
| `server/services/hyperLearningEngine.ts` | 0/1004 | 0/145 | 145 |
| `client/src/pages/Advertisement.tsx` | 91/388 | 6/151 | 145 |
| `client/src/App.tsx` | 0/296 | 0/136 | 136 |
| `client/src/components/distribution/AutoArtistSync.tsx` | 4/391 | 0/133 | 133 |
| `server/security-system.ts` | 0/564 | 0/131 | 131 |
| `server/services/distributionDataTransferService.ts` | 149/1168 | 21/146 | 125 |
| `external/maxcore/artifacts/api-server/src/routes/model-proxy.ts` | 407/733 | 39/161 | 122 |
| `client/src/pages/Admin.tsx` | 72/315 | 6/128 | 122 |
| `client/src/pages/Royalties.tsx` | 82/370 | 5/126 | 121 |
| `client/src/lib/video/SceneGraph.ts` | 1/380 | 2/122 | 120 |
| `server/services/careerCoachService.ts` | 3/206 | 1/119 | 118 |
| `shared/ml/models/AdvertisingAutopilotAI_v3.ts` | 0/615 | 0/112 | 112 |
| `external/pdim/artifacts/api-server/src/services/datasetDiscoveryService.ts` | 0/297 | 0/111 | 111 |
| `server/routes/marketplace.ts` | 64/1040 | 0/110 | 110 |
| `server/services/platformAutoFixer.ts` | 96/821 | 11/119 | 108 |
| `server/services/labelgrid-service.ts` | 24/528 | 10/115 | 105 |
| `client/src/pages/ProjectsPageImpl.tsx` | 43/336 | 7/112 | 105 |
| `server/testing-system.ts` | 0/389 | 0/103 | 103 |
| `client/src/components/studio/VideoTrack.tsx` | 4/382 | 0/102 | 102 |
| `server/index.ts` | 0/755 | 0/101 | 101 |
| `server/autonomous-updates.ts` | 0/513 | 0/101 | 101 |
| `shared/ml/models/SocialMediaAutopilotAI.ts` | 0/376 | 0/101 | 101 |
| `client/src/lib/audioEngine.ts` | 36/1261 | 4/103 | 99 |
| `client/src/components/studio/UltimateDAW.tsx` | 0/353 | 0/99 | 99 |
| `external/maxcore/lib/api-client-react/src/generated/api.ts` | 0/272 | 0/98 | 98 |
| `server/services/aiMusicService.ts` | 0/602 | 0/96 | 96 |
| `shared/ml/models/AdvertisingAutopilotAI.ts` | 0/348 | 0/93 | 93 |
| `client/src/components/studio/LyricsPanel.tsx` | 9/263 | 3/94 | 91 |
| `client/src/components/social/UnifiedCalendar.tsx` | 0/227 | 0/91 | 91 |
| `external/pdim/artifacts/api-server/src/pocket-dimension/fabric/PocketStorageService.ts` | 12/460 | 3/93 | 90 |
| `client/src/components/studio/WarpDialog.tsx` | 2/366 | 0/90 | 90 |
| `client/src/components/studio/LyricsTrack.tsx` | 0/343 | 0/90 | 90 |

The table shows at most 50 files with the largest uncovered surfaces. All 2661 measured files, exact function names and uncovered statement lines remain in the machine register.

## Limits

- Source declarations and import reachability do not prove that code executed or that business assertions cover it.
- The endpoint audit resolves main-server topology; imported declarations with unproven mounts retain that uncertainty.
- JSX controls/event bindings are indexed; runtime-generated controls, DOM mutation and data-dependent interactions still need explicit behavioral cases.
- An unreferenced component or unresolved mount may be retained/retired source rather than an active feature. Prove its runtime admission or exclusion before treating it as a current production gap.
- Route/UI requirements are a minimum test plan; domain-specific financial, legal, media-quality and provider semantics need their own assertions.
- V8 coverage covers instrumented JavaScript/TypeScript only; Python, Go and Rust remain separate test/evidence scopes.
- No production readiness, provider delivery, model quality, native VST3 processing or Replit deployment is inferred from this register.
