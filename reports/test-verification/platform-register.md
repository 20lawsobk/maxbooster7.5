# Platform feature and coverage register

**Gate: UNVERIFIED.** All required checks need exact current passing-case links, resolved mappings and actual execution coverage; static source matches do not close feature acceptance.

This source register and the machine JSON distinguish declarations, static associations, actual line/function execution and explicit behavioral acceptance. No source match or page render is promoted to full feature verification.

| Surface | Count |
| --- | ---: |
| routedPageDeclarations | 80 |
| uiInteractionDeclarations | 8374 |
| backendRegistrations | 2907 |
| frontendApiContracts | 932 |
| scannedTypeScriptJavaScriptFiles | 3404 |
| actualCoverageFiles | 2653 |
| requiredChecks | 33538 |
| unverifiedChecks | 33532 |
| unknownMappings | 130 |
| invalidEvidenceLinks | 0 |

## Routed pages

Each row links to its source and names the next test to add. The JSON retains every exact required-check ID, reachable source file, UI control, API call and candidate test association.

| Route | Component/source | Direct controls | API calls | Candidate tests | Acceptance | Next test |
| --- | --- | ---: | ---: | ---: | --- | --- |
| `/` | `Landing` — `client/src/pages/Landing.tsx:1` | 33 | 8 | 0 static candidates | UNVERIFIED | `tests/browser/landing-acceptance.test.mjs` |
| `/login` | `Login` — `client/src/pages/Login.tsx:1` | 15 | 7 | 0 static candidates | UNVERIFIED | `tests/browser/login-acceptance.test.mjs` |
| `/forgot-password` | `ForgotPassword` — `client/src/pages/ForgotPassword.tsx:1` | 11 | 1 | 0 static candidates | UNVERIFIED | `tests/browser/forgot-password-acceptance.test.mjs` |
| `/reset-password` | `ResetPassword` — `client/src/pages/ResetPassword.tsx:1` | 19 | 1 | 0 static candidates | UNVERIFIED | `tests/browser/reset-password-acceptance.test.mjs` |
| `/register` | `Register` — `client/src/pages/Register.tsx:1` | 19 | 8 | 1 static candidates | UNVERIFIED | `tests/browser/register-acceptance.test.mjs` |
| `/register/payment/:tier` | `RegisterPayment` — `client/src/pages/RegisterPayment.tsx:1` | 19 | 0 | 2 static candidates | UNVERIFIED | `tests/browser/register-payment-tier-acceptance.test.mjs` |
| `/register/success` | `RegisterSuccess` — `client/src/pages/RegisterSuccess.tsx:1` | 19 | 8 | 0 static candidates | UNVERIFIED | `tests/browser/register-success-acceptance.test.mjs` |
| `/dashboard` | `Dashboard` — `client/src/pages/Dashboard.tsx:1` | 148 | 34 | 5 static candidates | UNVERIFIED | `tests/browser/dashboard-acceptance.test.mjs` |
| `/simplified-dashboard` | `SimplifiedDashboard` — `client/src/pages/SimplifiedDashboard.tsx:1` | 53 | 15 | 2 static candidates | UNVERIFIED | `tests/browser/simplified-dashboard-acceptance.test.mjs` |
| `/projects` | `Projects` — `client/src/pages/Projects.tsx:1` | 0 | 0 | 2 static candidates | UNVERIFIED | `tests/browser/projects-acceptance.test.mjs` |
| `/desktop-app` | `DesktopApp` — `client/src/pages/DesktopApp.tsx:1` | 0 | 0 | 1 static candidates | UNVERIFIED | `tests/browser/desktop-app-acceptance.test.mjs` |
| `/analytics/ai` | `AIDashboard` — `client/src/pages/analytics/AIDashboard.tsx:1` | 49 | 14 | 0 static candidates | UNVERIFIED | `tests/browser/analytics-ai-acceptance.test.mjs` |
| `/analytics` | `Analytics` — `client/src/pages/Analytics.tsx:1` | 196 | 30 | 2 static candidates | UNVERIFIED | `tests/browser/analytics-acceptance.test.mjs` |
| `/developer-api` | `DeveloperApi` — `client/src/pages/DeveloperApi.tsx:1` | 72 | 17 | 1 static candidates | UNVERIFIED | `tests/browser/developer-api-acceptance.test.mjs` |
| `/social-media` | `SocialMedia` — `client/src/pages/SocialMedia.tsx:1` | 496 | 61 | 7 static candidates | UNVERIFIED | `tests/browser/social-media-acceptance.test.mjs` |
| `/advertising` | `Advertisement` — `client/src/pages/Advertisement.tsx:1` | 258 | 39 | 2 static candidates | UNVERIFIED | `tests/browser/advertising-acceptance.test.mjs` |
| `/marketplace` | `Marketplace` — `client/src/pages/Marketplace.tsx:1` | 595 | 46 | 2 static candidates | UNVERIFIED | `tests/browser/marketplace-acceptance.test.mjs` |
| `/marketplace/beat/:beatId` | `Marketplace` — `client/src/pages/Marketplace.tsx:1` | 595 | 46 | 2 static candidates | UNVERIFIED | `tests/browser/marketplace-beat-beatid-acceptance.test.mjs` |
| `/marketplace/producer/:producerId` | `ProducerProfilePage` — `client/src/pages/ProducerProfilePage.tsx:1` | 70 | 18 | 0 static candidates | UNVERIFIED | `tests/browser/marketplace-producer-producerid-acceptance.test.mjs` |
| `/royalties` | `Royalties` — `client/src/pages/Royalties.tsx:1` | 130 | 40 | 2 static candidates | UNVERIFIED | `tests/browser/royalties-acceptance.test.mjs` |
| `/studio/:projectId` | `Studio` — `client/src/pages/Studio.tsx:1` | 627 | 85 | 1 static candidates | UNVERIFIED | `tests/browser/studio-projectid-acceptance.test.mjs` |
| `/studio` | `Studio` — `client/src/pages/Studio.tsx:1` | 627 | 85 | 1 static candidates | UNVERIFIED | `tests/browser/studio-acceptance.test.mjs` |
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
| `/terms` | `Terms` — `client/src/pages/Terms.tsx:1` | 11 | 0 | 3 static candidates | UNVERIFIED | `tests/browser/terms-acceptance.test.mjs` |
| `/privacy` | `Privacy` — `client/src/pages/Privacy.tsx:1` | 5 | 0 | 1 static candidates | UNVERIFIED | `tests/browser/privacy-acceptance.test.mjs` |
| `/onboarding` | `Onboarding` — `client/src/pages/Onboarding.tsx:1` | 59 | 13 | 1 static candidates | UNVERIFIED | `tests/browser/onboarding-acceptance.test.mjs` |
| `/help` | `Help` — `client/src/pages/Help.tsx:1` | 7 | 0 | 2 static candidates | UNVERIFIED | `tests/browser/help-acceptance.test.mjs` |
| `/storefront` | `Storefront` — `client/src/pages/Storefront.tsx:1` | 28 | 15 | 0 static candidates | UNVERIFIED | `tests/browser/storefront-acceptance.test.mjs` |
| `/storefront/:slug` | `Storefront` — `client/src/pages/Storefront.tsx:1` | 28 | 15 | 0 static candidates | UNVERIFIED | `tests/browser/storefront-slug-acceptance.test.mjs` |
| `/store/:slug` | `Storefront` — `client/src/pages/Storefront.tsx:1` | 28 | 15 | 0 static candidates | UNVERIFIED | `tests/browser/store-slug-acceptance.test.mjs` |
| `/s/:label` | `StorefrontShortLink` — `client/src/App.tsx:265` | 4 | 1 | 0 static candidates | UNVERIFIED | `tests/browser/s-label-acceptance.test.mjs` |
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
| `/epk/:slug` | `PublicPressKit` — `client/src/pages/PublicPressKit.tsx:1` | 10 | 1 | 0 static candidates | UNVERIFIED | `tests/browser/epk-slug-acceptance.test.mjs` |
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
| `main-endpoint-audit/analyze` | 4 | 2 | 25 |
| `main-endpoint-audit/api-docs.json` | 1 | 1 | 5 |
| `main-endpoint-audit/ar-intelligence` | 3 | 1 | 15 |
| `main-endpoint-audit/artist-profiles` | 29 | 1 | 164 |
| `main-endpoint-audit/artist-progress` | 5 | 1 | 26 |
| `main-endpoint-audit/assets` | 2 | 1 | 11 |
| `main-endpoint-audit/assistant` | 3 | 1 | 18 |
| `main-endpoint-audit/audio` | 7 | 2 | 47 |
| `main-endpoint-audit/audio-analysis` | 6 | 1 | 40 |
| `main-endpoint-audit/audio-job` | 1 | 1 | 6 |
| `main-endpoint-audit/audio-processing` | 8 | 1 | 53 |
| `main-endpoint-audit/audit` | 2 | 1 | 11 |
| `main-endpoint-audit/auth` | 84 | 7 | 487 |
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
| `main-endpoint-audit/campaigns` | 6 | 1 | 35 |
| `main-endpoint-audit/career-coach` | 13 | 1 | 74 |
| `main-endpoint-audit/certified-analytics` | 17 | 1 | 88 |
| `main-endpoint-audit/clear-all` | 1 | 1 | 7 |
| `main-endpoint-audit/collaboration` | 18 | 1 | 105 |
| `main-endpoint-audit/collaborations` | 14 | 1 | 78 |
| `main-endpoint-audit/content` | 12 | 3 | 78 |
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
| `main-endpoint-audit/export` | 26 | 1 | 152 |
| `main-endpoint-audit/fabric` | 14 | 1 | 77 |
| `main-endpoint-audit/fan-campaigns` | 7 | 1 | 40 |
| `main-endpoint-audit/fan-hub` | 14 | 1 | 80 |
| `main-endpoint-audit/fan-memberships` | 9 | 1 | 50 |
| `main-endpoint-audit/files` | 15 | 2 | 85 |
| `main-endpoint-audit/generate` | 8 | 2 | 56 |
| `main-endpoint-audit/generate-video` | 1 | 1 | 7 |
| `main-endpoint-audit/generation` | 1 | 1 | 6 |
| `main-endpoint-audit/gpu` | 1 | 1 | 5 |
| `main-endpoint-audit/growth` | 23 | 1 | 135 |
| `main-endpoint-audit/health` | 15 | 7 | 92 |
| `main-endpoint-audit/helpdesk` | 5 | 1 | 28 |
| `main-endpoint-audit/history` | 1 | 1 | 7 |
| `main-endpoint-audit/hns` | 11 | 1 | 60 |
| `main-endpoint-audit/hybrid-storage` | 10 | 1 | 56 |
| `main-endpoint-audit/infer` | 1 | 1 | 6 |
| `main-endpoint-audit/infrastructure` | 1 | 1 | 5 |
| `main-endpoint-audit/insights` | 1 | 1 | 5 |
| `main-endpoint-audit/internal` | 2 | 1 | 14 |
| `main-endpoint-audit/invoices` | 10 | 1 | 59 |
| `main-endpoint-audit/jobs` | 1 | 1 | 6 |
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
| `main-endpoint-audit/optimize` | 1 | 1 | 6 |
| `main-endpoint-audit/organic` | 11 | 1 | 58 |
| `main-endpoint-audit/outreach` | 8 | 1 | 47 |
| `main-endpoint-audit/paid` | 2 | 1 | 10 |
| `main-endpoint-audit/payment-bypass` | 1 | 1 | 5 |
| `main-endpoint-audit/payouts` | 32 | 1 | 174 |
| `main-endpoint-audit/personalization` | 35 | 1 | 195 |
| `main-endpoint-audit/ping` | 1 | 1 | 4 |
| `main-endpoint-audit/platform` | 14 | 1 | 86 |
| `main-endpoint-audit/platform-sync` | 12 | 1 | 67 |
| `main-endpoint-audit/playlist-pitching` | 8 | 1 | 45 |
| `main-endpoint-audit/pocket` | 6 | 1 | 32 |
| `main-endpoint-audit/predict` | 1 | 1 | 6 |
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
| `main-endpoint-audit/ready` | 5 | 5 | 29 |
| `main-endpoint-audit/readyz` | 1 | 1 | 5 |
| `main-endpoint-audit/register-after-payment` | 1 | 1 | 6 |
| `main-endpoint-audit/retention` | 5 | 1 | 29 |
| `main-endpoint-audit/revenue-forecast` | 6 | 1 | 34 |
| `main-endpoint-audit/robots.txt` | 1 | 1 | 5 |
| `main-endpoint-audit/root` | 4 | 3 | 20 |
| `main-endpoint-audit/royalties` | 20 | 1 | 110 |
| `main-endpoint-audit/s` | 1 | 1 | 5 |
| `main-endpoint-audit/safety` | 1 | 1 | 6 |
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
| `main-endpoint-audit/storage` | 26 | 3 | 149 |
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
| `main-endpoint-audit/train` | 4 | 2 | 22 |
| `main-endpoint-audit/training` | 24 | 2 | 133 |
| `main-endpoint-audit/undo` | 16 | 1 | 94 |
| `main-endpoint-audit/unread-count` | 1 | 1 | 5 |
| `main-endpoint-audit/uploads` | 4 | 2 | 24 |
| `main-endpoint-audit/user` | 8 | 2 | 45 |
| `main-endpoint-audit/users` | 3 | 1 | 17 |
| `main-endpoint-audit/v1` | 17 | 1 | 88 |
| `main-endpoint-audit/venues` | 6 | 1 | 34 |
| `main-endpoint-audit/verify-checkout-session` | 1 | 1 | 6 |
| `main-endpoint-audit/version` | 1 | 1 | 5 |
| `main-endpoint-audit/video` | 2 | 1 | 14 |
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
| `python-decorator-ast/analyze` | 7 | 2 | 44 |
| `python-decorator-ast/api-keys` | 4 | 1 | 24 |
| `python-decorator-ast/audio` | 6 | 1 | 40 |
| `python-decorator-ast/audio-job` | 3 | 2 | 20 |
| `python-decorator-ast/awareness` | 4 | 1 | 22 |
| `python-decorator-ast/boostsheets` | 1 | 1 | 5 |
| `python-decorator-ast/campaign` | 1 | 1 | 6 |
| `python-decorator-ast/campaigns` | 6 | 1 | 35 |
| `python-decorator-ast/capability` | 1 | 1 | 5 |
| `python-decorator-ast/concurrency` | 1 | 1 | 5 |
| `python-decorator-ast/config` | 1 | 1 | 5 |
| `python-decorator-ast/content` | 3 | 2 | 19 |
| `python-decorator-ast/control` | 7 | 1 | 41 |
| `python-decorator-ast/coverage` | 5 | 1 | 26 |
| `python-decorator-ast/dashboard` | 1 | 1 | 5 |
| `python-decorator-ast/dataset` | 1 | 1 | 5 |
| `python-decorator-ast/datasets` | 3 | 1 | 15 |
| `python-decorator-ast/feedback` | 1 | 1 | 6 |
| `python-decorator-ast/files` | 1 | 1 | 5 |
| `python-decorator-ast/generate` | 16 | 3 | 112 |
| `python-decorator-ast/generate-video` | 2 | 2 | 14 |
| `python-decorator-ast/generation` | 1 | 1 | 6 |
| `python-decorator-ast/gpu` | 10 | 2 | 51 |
| `python-decorator-ast/health` | 4 | 3 | 24 |
| `python-decorator-ast/image` | 1 | 1 | 7 |
| `python-decorator-ast/infer` | 1 | 1 | 6 |
| `python-decorator-ast/insights` | 1 | 1 | 6 |
| `python-decorator-ast/knowledge` | 4 | 1 | 21 |
| `python-decorator-ast/maxcore` | 2 | 1 | 11 |
| `python-decorator-ast/memory` | 1 | 1 | 5 |
| `python-decorator-ast/metrics` | 2 | 1 | 10 |
| `python-decorator-ast/model` | 1 | 1 | 5 |
| `python-decorator-ast/models` | 12 | 2 | 61 |
| `python-decorator-ast/optimize` | 2 | 2 | 12 |
| `python-decorator-ast/platform` | 14 | 1 | 86 |
| `python-decorator-ast/platforms` | 1 | 1 | 5 |
| `python-decorator-ast/predict` | 3 | 3 | 18 |
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
| `python-decorator-ast/text` | 1 | 1 | 6 |
| `python-decorator-ast/train` | 10 | 3 | 57 |
| `python-decorator-ast/training` | 22 | 3 | 121 |
| `python-decorator-ast/upload` | 1 | 1 | 6 |
| `python-decorator-ast/url-parser` | 2 | 1 | 10 |
| `python-decorator-ast/video` | 3 | 2 | 21 |
| `python-decorator-ast/video-job` | 6 | 1 | 38 |
| `python-decorator-ast/video-jobs` | 1 | 1 | 6 |
| `python-decorator-ast/warm` | 2 | 1 | 11 |
| `python-decorator-ast/watchdog` | 3 | 1 | 16 |
| `python-decorator-ast/website` | 1 | 1 | 6 |
| `typescript-router-ast/*path` | 1 | 1 | 5 |
| `typescript-router-ast/<computed>` | 9 | 4 | 49 |
| `typescript-router-ast/activate` | 1 | 1 | 6 |
| `typescript-router-ast/activity` | 1 | 1 | 5 |
| `typescript-router-ast/ai-insights` | 1 | 1 | 5 |
| `typescript-router-ast/analysis` | 1 | 1 | 6 |
| `typescript-router-ast/analytics` | 4 | 2 | 22 |
| `typescript-router-ast/analyze` | 3 | 1 | 19 |
| `typescript-router-ast/analyze-audio` | 1 | 1 | 7 |
| `typescript-router-ast/analyze-audio-beats` | 1 | 1 | 7 |
| `typescript-router-ast/analyze-image` | 1 | 1 | 7 |
| `typescript-router-ast/analyze-reference-voice` | 1 | 1 | 6 |
| `typescript-router-ast/analyze-url` | 1 | 1 | 6 |
| `typescript-router-ast/api-keys` | 4 | 1 | 24 |
| `typescript-router-ast/audio` | 6 | 1 | 40 |
| `typescript-router-ast/audio-job` | 1 | 1 | 6 |
| `typescript-router-ast/autopush` | 2 | 1 | 11 |
| `typescript-router-ast/awareness` | 4 | 1 | 21 |
| `typescript-router-ast/beat-analyze` | 1 | 1 | 6 |
| `typescript-router-ast/benchmark` | 3 | 1 | 15 |
| `typescript-router-ast/boostsheets` | 1 | 1 | 5 |
| `typescript-router-ast/calendar` | 9 | 1 | 54 |
| `typescript-router-ast/campaigns` | 6 | 1 | 35 |
| `typescript-router-ast/chunk` | 3 | 1 | 18 |
| `typescript-router-ast/competitors` | 3 | 1 | 18 |
| `typescript-router-ast/concurrency` | 1 | 1 | 5 |
| `typescript-router-ast/connections` | 1 | 1 | 5 |
| `typescript-router-ast/content` | 2 | 1 | 13 |
| `typescript-router-ast/dashboard` | 1 | 1 | 5 |
| `typescript-router-ast/datasets` | 10 | 1 | 55 |
| `typescript-router-ast/delete` | 1 | 1 | 6 |
| `typescript-router-ast/download` | 1 | 1 | 5 |
| `typescript-router-ast/fabric` | 14 | 1 | 76 |
| `typescript-router-ast/files` | 1 | 1 | 5 |
| `typescript-router-ast/generate` | 6 | 1 | 42 |
| `typescript-router-ast/generate-content` | 1 | 1 | 7 |
| `typescript-router-ast/generate-from-url` | 1 | 1 | 7 |
| `typescript-router-ast/generate-image` | 1 | 1 | 7 |
| `typescript-router-ast/generate-music-video` | 1 | 1 | 7 |
| `typescript-router-ast/generate-video` | 2 | 2 | 14 |
| `typescript-router-ast/generation` | 1 | 1 | 6 |
| `typescript-router-ast/gpu` | 9 | 1 | 46 |
| `typescript-router-ast/hashtags` | 1 | 1 | 5 |
| `typescript-router-ast/health` | 4 | 3 | 24 |
| `typescript-router-ast/healthz` | 3 | 3 | 18 |
| `typescript-router-ast/inbox` | 9 | 1 | 50 |
| `typescript-router-ast/infer` | 1 | 1 | 6 |
| `typescript-router-ast/jobs` | 2 | 1 | 11 |
| `typescript-router-ast/keepalive` | 1 | 1 | 5 |
| `typescript-router-ast/listening` | 4 | 1 | 20 |
| `typescript-router-ast/maxcore` | 1 | 1 | 5 |
| `typescript-router-ast/metrics` | 2 | 2 | 10 |
| `typescript-router-ast/model` | 1 | 1 | 5 |
| `typescript-router-ast/models` | 4 | 1 | 20 |
| `typescript-router-ast/monitor` | 8 | 1 | 44 |
| `typescript-router-ast/multimodal` | 2 | 1 | 12 |
| `typescript-router-ast/music-video-capabilities` | 1 | 1 | 6 |
| `typescript-router-ast/music-video-job` | 1 | 1 | 6 |
| `typescript-router-ast/optimize` | 1 | 1 | 6 |
| `typescript-router-ast/platform` | 14 | 1 | 86 |
| `typescript-router-ast/platform-status` | 1 | 1 | 5 |
| `typescript-router-ast/pocket` | 4 | 1 | 22 |
| `typescript-router-ast/posts` | 1 | 1 | 5 |
| `typescript-router-ast/predict` | 1 | 1 | 6 |
| `typescript-router-ast/redis` | 8 | 1 | 46 |
| `typescript-router-ast/root` | 1 | 1 | 5 |
| `typescript-router-ast/rta` | 1 | 1 | 5 |
| `typescript-router-ast/safety` | 1 | 1 | 6 |
| `typescript-router-ast/schedule-post` | 1 | 1 | 6 |
| `typescript-router-ast/scheduled` | 1 | 1 | 5 |
| `typescript-router-ast/storage` | 15 | 1 | 83 |
| `typescript-router-ast/sync-all` | 1 | 1 | 6 |
| `typescript-router-ast/synthesize-voice` | 1 | 1 | 6 |
| `typescript-router-ast/system` | 1 | 1 | 6 |
| `typescript-router-ast/train` | 1 | 1 | 6 |
| `typescript-router-ast/training` | 17 | 1 | 94 |
| `typescript-router-ast/unified-calendar` | 4 | 1 | 20 |
| `typescript-router-ast/upload` | 2 | 1 | 12 |
| `typescript-router-ast/uploads` | 1 | 1 | 5 |
| `typescript-router-ast/url-parser` | 2 | 1 | 10 |
| `typescript-router-ast/veo-campaign` | 9 | 1 | 50 |
| `typescript-router-ast/veo-url` | 1 | 1 | 6 |
| `typescript-router-ast/video` | 2 | 1 | 14 |
| `typescript-router-ast/video-job` | 7 | 2 | 44 |
| `typescript-router-ast/video-jobs` | 1 | 1 | 6 |
| `typescript-router-ast/video-proxy` | 1 | 1 | 6 |
| `typescript-router-ast/video-templates` | 1 | 1 | 6 |
| `typescript-router-ast/voice-profiles` | 1 | 1 | 5 |
| `typescript-router-ast/warm` | 2 | 1 | 11 |
| `typescript-router-ast/watchdog` | 3 | 1 | 16 |
| `typescript-router-ast/weekly-stats` | 1 | 1 | 5 |
| `typescript-router-ast/your-stats` | 1 | 1 | 5 |

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
| `client/src/pages/Marketplace.tsx` | 0/1561 | 0/572 | 572 |
| `client/src/components/studio/StudioOneDAW.tsx` | 0/1507 | 0/452 | 452 |
| `client/src/lib/studioStore.ts` | 5/551 | 1/356 | 355 |
| `server/routes.ts` | 0/2843 | 0/345 | 345 |
| `server/routes/distribution.ts` | 194/2627 | 2/323 | 321 |
| `client/src/pages/Distribution.tsx` | 0/706 | 0/307 | 307 |
| `client/src/pages/SocialMedia.tsx` | 0/875 | 0/252 | 252 |
| `server/storage.ts` | 1/901 | 0/240 | 240 |
| `server/services/artistProfileService.ts` | 0/1210 | 0/239 | 239 |
| `server/routes/socialMedia.ts` | 0/1859 | 0/220 | 220 |
| `client/src/stores/studioStore.ts` | 17/292 | 4/214 | 210 |
| `client/src/components/studio/HighPerformanceDAW.tsx` | 0/508 | 0/203 | 203 |
| `server/routes/studio.ts` | 0/1855 | 0/188 | 188 |
| `server/lib/pdimClient.ts` | 529/954 | 92/278 | 186 |
| `shared/ml/models/AdOptimizationEngine.ts` | 0/902 | 0/163 | 163 |
| `client/src/components/marketplace/StorefrontBuilder.tsx` | 86/493 | 3/158 | 155 |
| `external/pdim/artifacts/api-server/src/redis/store.ts` | 1379/3004 | 185/339 | 154 |
| `client/src/pages/Advertisement.tsx` | 0/388 | 0/151 | 151 |
| `client/src/components/marketplace/StorefrontDnsZoneManager.tsx` | 8/338 | 0/147 | 147 |
| `server/services/hyperLearningEngine.ts` | 0/1004 | 0/145 | 145 |
| `client/src/App.tsx` | 0/296 | 0/136 | 136 |
| `client/src/components/distribution/AutoArtistSync.tsx` | 0/391 | 0/133 | 133 |
| `server/security-system.ts` | 0/564 | 0/131 | 131 |
| `client/src/pages/Admin.tsx` | 0/315 | 0/128 | 128 |
| `server/services/distributionDataTransferService.ts` | 149/1168 | 21/146 | 125 |
| `client/src/pages/Royalties.tsx` | 70/370 | 2/126 | 124 |
| `client/src/lib/video/SceneGraph.ts` | 0/380 | 0/122 | 122 |
| `external/maxcore/artifacts/api-server/src/routes/model-proxy.ts` | 408/734 | 39/161 | 122 |
| `server/services/careerCoachService.ts` | 0/206 | 0/119 | 119 |
| `shared/ml/models/AdvertisingAutopilotAI_v3.ts` | 0/615 | 0/112 | 112 |
| `client/src/pages/ProjectsPageImpl.tsx` | 0/336 | 0/112 | 112 |
| `external/pdim/artifacts/api-server/src/services/datasetDiscoveryService.ts` | 0/297 | 0/111 | 111 |
| `server/routes/marketplace.ts` | 0/1040 | 0/110 | 110 |
| `server/services/platformAutoFixer.ts` | 96/821 | 11/119 | 108 |
| `server/services/labelgrid-service.ts` | 24/528 | 10/115 | 105 |
| `client/src/lib/audioEngine.ts` | 0/1261 | 0/103 | 103 |
| `server/testing-system.ts` | 0/389 | 0/103 | 103 |
| `client/src/components/studio/VideoTrack.tsx` | 0/382 | 0/102 | 102 |
| `server/autonomous-updates.ts` | 0/513 | 0/101 | 101 |
| `shared/ml/models/SocialMediaAutopilotAI.ts` | 0/376 | 0/101 | 101 |
| `server/index.ts` | 0/747 | 0/100 | 100 |
| `client/src/components/studio/UltimateDAW.tsx` | 0/343 | 0/97 | 97 |
| `server/services/aiMusicService.ts` | 0/602 | 0/96 | 96 |
| `client/src/components/studio/LyricsPanel.tsx` | 0/263 | 0/94 | 94 |
| `client/src/pages/ShowPage.tsx` | 0/232 | 0/94 | 94 |
| `shared/ml/models/AdvertisingAutopilotAI.ts` | 0/348 | 0/93 | 93 |
| `server/services/dnsProviderService.ts` | 0/485 | 0/92 | 92 |
| `client/src/lib/daw/DAWCore.ts` | 0/283 | 0/91 | 91 |
| `client/src/components/social/UnifiedCalendar.tsx` | 0/227 | 0/91 | 91 |
| `external/pdim/artifacts/api-server/src/pocket-dimension/fabric/PocketStorageService.ts` | 12/460 | 3/93 | 90 |

The table shows at most 50 files with the largest uncovered surfaces. All 2653 measured files, exact function names and uncovered statement lines remain in the machine register.

## Limits

- Source declarations and import reachability do not prove that code executed or that business assertions cover it.
- The endpoint audit resolves main-server topology; imported declarations with unproven mounts retain that uncertainty.
- JSX controls/event bindings are indexed; runtime-generated controls, DOM mutation and data-dependent interactions still need explicit behavioral cases.
- An unreferenced component or unresolved mount may be retained/retired source rather than an active feature. Prove its runtime admission or exclusion before treating it as a current production gap.
- Route/UI requirements are a minimum test plan; domain-specific financial, legal, media-quality and provider semantics need their own assertions.
- V8 coverage covers instrumented JavaScript/TypeScript only; Python, Go and Rust remain separate test/evidence scopes.
- No production readiness, provider delivery, model quality, native VST3 processing or Replit deployment is inferred from this register.
