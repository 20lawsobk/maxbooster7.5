# Frontend generation wiring across all 80 routes

Fresh TypeScript import graph and generation endpoint references for all 80 route declarations. Conservative dependency closure includes barrel exports and does not prove a component renders or that a generation request succeeds. Named direct consumers and manually reviewed workflows distinguish actual UI controls. No provider/backend actions.

Parsed 955 source files; mapped 80 route declarations and 24 direct generation-reference files.

| Route | Detected modalities | Direct generation consumers in import closure |
|---|---|---|
| `/` | none detected | No generation reference |
| `/login` | none detected | No generation reference |
| `/forgot-password` | none detected | No generation reference |
| `/reset-password` | none detected | No generation reference |
| `/register` | none detected | No generation reference |
| `/register/payment/:tier` | none detected | No generation reference |
| `/register/success` | none detected | No generation reference |
| `/dashboard` | text | `pages/Dashboard.tsx`, `hooks/useAnalyticsInvalidation.ts`, `components/dashboard/AICareerCoach.tsx` |
| `/simplified-dashboard` | none detected | No generation reference |
| `/projects` | text | `hooks/useAnalyticsInvalidation.ts` |
| `/desktop-app` | none detected | No generation reference |
| `/analytics/ai` | text | `pages/analytics/AIDashboard.tsx` |
| `/analytics` | none detected | No generation reference |
| `/developer-api` | none detected | No generation reference |
| `/social-media` | audio, image, text, video | `pages/SocialMedia.tsx`, `hooks/useAnalyticsInvalidation.ts`, `components/content/LocalMediaRenderer.tsx`, `components/content/ServerVideoGenerator.tsx`, `components/content/AIImageGenerator.tsx` |
| `/advertising` | audio, image, text, video | `pages/Advertisement.tsx`, `hooks/useAnalyticsInvalidation.ts`, `components/content/LocalMediaRenderer.tsx`, `components/content/ServerVideoGenerator.tsx`, `components/content/AIImageGenerator.tsx`, `components/advertising/CreativeVariantGenerator.tsx` |
| `/marketplace` | text | `hooks/useAnalyticsInvalidation.ts` |
| `/marketplace/beat/:beatId` | text | `hooks/useAnalyticsInvalidation.ts` |
| `/marketplace/producer/:producerId` | none detected | No generation reference |
| `/royalties` | text | `hooks/useAnalyticsInvalidation.ts` |
| `/studio/:projectId` | audio, image, video | `components/studio/StudioOneDAW.tsx`, `components/studio/AIMusicGenerator.tsx`, `components/content/LocalMediaRenderer.tsx` |
| `/studio` | audio, image, video | `components/studio/StudioOneDAW.tsx`, `components/studio/AIMusicGenerator.tsx`, `components/content/LocalMediaRenderer.tsx` |
| `/show` | none detected | No generation reference |
| `/distribution` | text, video | `pages/Distribution.tsx`, `hooks/useAnalyticsInvalidation.ts` |
| `/pricing` | none detected | No generation reference |
| `/subscribe/:tier` | none detected | No generation reference |
| `/admin/security` | none detected | No generation reference |
| `/admin/audit-log` | none detected | No generation reference |
| `/admin/support/tickets/:ticketId` | none detected | No generation reference |
| `/admin/support` | none detected | No generation reference |
| `/support/tickets/:ticketId` | none detected | No generation reference |
| `/admin/kyc` | none detected | No generation reference |
| `/admin/training` | none detected | No generation reference |
| `/admin/content-sampler` | none detected | No generation reference |
| `/admin/dashboard` | none detected | No generation reference |
| `/admin/beat-money-loop` | none detected | No generation reference |
| `/admin` | none detected | No generation reference |
| `/settings` | none detected | No generation reference |
| `/features` | none detected | No generation reference |
| `/api-docs` | none detected | No generation reference |
| `/documentation` | none detected | No generation reference |
| `/about` | none detected | No generation reference |
| `/blog` | none detected | No generation reference |
| `/blog/:slug` | none detected | No generation reference |
| `/solo-founder-story` | none detected | No generation reference |
| `/security` | none detected | No generation reference |
| `/dmca` | none detected | No generation reference |
| `/terms` | none detected | No generation reference |
| `/privacy` | none detected | No generation reference |
| `/onboarding` | none detected | No generation reference |
| `/help` | none detected | No generation reference |
| `/storefront` | none detected | No generation reference |
| `/storefront/:slug` | none detected | No generation reference |
| `/store/:slug` | none detected | No generation reference |
| `/s/:label` | audio, image, text, video | `pages/analytics/AIDashboard.tsx`, `pages/SocialMedia.tsx`, `pages/OutreachCRM.tsx`, `pages/Distribution.tsx`, `pages/Dashboard.tsx`, `pages/CareerCoach.tsx`, `pages/Assistant.tsx`, `pages/Advertisement.tsx`, `hooks/useAnalyticsInvalidation.ts`, `components/support/AIAssistantPublic.tsx`, `components/studio/StudioOneDAW.tsx`, `components/studio/AIMusicGenerator.tsx`, `components/dashboard/AICareerCoach.tsx`, `components/content/LocalMediaRenderer.tsx`, `components/content/ServerVideoGenerator.tsx`, `components/content/AIImageGenerator.tsx`, `components/advertising/CreativeVariantGenerator.tsx` |
| `/admin/autonomy` | none detected | No generation reference |
| `/verification` | none detected | No generation reference |
| `/contracts` | none detected | No generation reference |
| `/workspaces` | none detected | No generation reference |
| `/collaborations` | none detected | No generation reference |
| `/career-coach` | text | `pages/CareerCoach.tsx` |
| `/assistant` | text | `pages/Assistant.tsx` |
| `/release-countdown` | none detected | No generation reference |
| `/invoices` | none detected | No generation reference |
| `/handle-link` | none detected | No generation reference |
| `/notifications/:id` | none detected | No generation reference |
| `/notifications` | none detected | No generation reference |
| `/workflow-automations` | none detected | No generation reference |
| `/shows` | none detected | No generation reference |
| `/fan-hub` | none detected | No generation reference |
| `/fan-memberships` | none detected | No generation reference |
| `/ar-intelligence` | none detected | No generation reference |
| `/outreach` | text | `pages/OutreachCRM.tsx` |
| `/merch` | none detected | No generation reference |
| `/press-kit` | none detected | No generation reference |
| `/playlist-pitching` | none detected | No generation reference |
| `/publishing` | none detected | No generation reference |
| `/sync-licensing` | none detected | No generation reference |
| `/epk/:slug` | none detected | No generation reference |
| `*` | none detected | No generation reference |

## Direct consumers

### client/src/pages/analytics/AIDashboard.tsx

Routes: `/analytics/ai`, `/s/:label`

- POST `/api/ai/analytics/insights`, line22; text; fetch.
- Configured `/api/ai/analytics/insights`, line48; text; reference.

### client/src/pages/SocialMedia.tsx

Routes: `/social-media`, `/s/:label`

- POST `/api/social/generate-content`, line922; text; apiRequest.
- POST `/api/multimodal/generate`, line939; text/image/audio/video; apiRequest.
- POST `/api/social/generate-from-url`, line1072; text; apiRequest.
- POST `/api/multimodal/generate`, line1098; text/image/audio/video; apiRequest.
- Configured `/api/social/generate-image`, line2481; image; reference.
- Configured `/api/social/generate-image`, line3302; image; reference.

### client/src/pages/OutreachCRM.tsx

Routes: `/s/:label`, `/outreach`

- POST `/api/outreach/generate-pitch`, line289; text; apiRequest.

### client/src/pages/Distribution.tsx

Routes: `/distribution`, `/s/:label`

- POST `/api/social/generate-music-video`, line6692; video; fetch.

### client/src/pages/Dashboard.tsx

Routes: `/dashboard`, `/s/:label`

- Configured `/api/ai/insights`, line324; text; reference.
- GET `/api/ai/insights`, line329; text; apiRequest.
- POST `/api/ai/optimize-content`, line360; text; apiRequest.

### client/src/pages/CareerCoach.tsx

Routes: `/s/:label`, `/career-coach`

- Configured `/api/career-coach/recommendations`, line142; text; reference.
- POST `/api/assistant/chat`, line220; text; apiRequest.
- Configured `/api/career-coach/recommendations`, line504; text; reference.

### client/src/pages/Assistant.tsx

Routes: `/s/:label`, `/assistant`

- POST `/api/assistant/chat`, line236; text; apiFetch.

### client/src/pages/Advertisement.tsx

Routes: `/advertising`, `/s/:label`

- POST `/api/advertising/generate-campaign`, line250; text; apiRequest.
- Configured `/api/advertising/generate-video`, line2173; video; reference.
- Configured `/api/advertising/generate-image`, line2229; image; reference.

### client/src/hooks/useAnalyticsInvalidation.ts

Routes: `/dashboard`, `/projects`, `/social-media`, `/advertising`, `/marketplace`, `/marketplace/beat/:beatId`, `/royalties`, `/distribution`, `/s/:label`

- Configured `/api/ai/insights`, line16; text; reference.

### client/src/hooks/use-advertisement.ts

Routes: Not reachable from the80 registered route import closures

- POST `/api/advertising/generate-content`, line182; text; apiRequest.

### client/src/components/support/AIAssistantPublic.tsx

Routes: `/s/:label`

- POST `/api/assistant/chat`, line49; text; fetch.

### client/src/components/support/AIAssistantBubble.tsx

Routes: Not reachable from the80 registered route import closures

- POST `/api/assistant/chat`, line192; text; apiFetch.

### client/src/components/studio/UltimateDAW.tsx

Routes: Not reachable from the80 registered route import closures

- POST `/api/studio/generation/text`, line392; audio; apiRequest.

### client/src/components/studio/StudioOneDAW.tsx

Routes: `/studio/:projectId`, `/studio`, `/s/:label`

- POST `/api/studio/generation/text`, line1459; audio; apiRequest.
- POST `/api/studio/generation/pattern/arrangement`, line1623; audio; apiRequest.
- POST `/api/studio/generation/pattern/chords`, line1665; audio; apiRequest.

### client/src/components/studio/FlowStateLyricsToMelody.tsx

Routes: Not reachable from the80 registered route import closures

- POST `/api/studio/generation/pattern/melody`, line184; audio; apiRequest.

### client/src/components/studio/AIMusicGenerator.tsx

Routes: `/studio/:projectId`, `/studio`, `/s/:label`

- POST `/api/studio/generation/text`, line271; audio; apiRequest.
- POST `/api/studio/generation/pattern/arrangement`, line415; audio; apiRequest.

### client/src/components/social/ContentGenerator.tsx

Routes: Not reachable from the80 registered route import closures

- Configured `/api/social/generate/context`, line425; text; reference.
- GET `/api/social/generate/context`, line428; text; apiRequest.
- POST `/api/social/ai-content/multilingual`, line469; text; apiRequest.
- POST `/api/social/generate`, line500; text; apiRequest.
- POST `/api/social/ai-content/optimize-hashtags`, line526; text; apiRequest.
- POST `/api/social/ai-content/ab-variants`, line544; text; apiRequest.
- POST `/api/social/generate-image`, line583; image; apiRequest.
- POST `/api/multimodal/generate`, line608; text/image/audio/video; apiRequest.

### client/src/components/personalization/PersonalizedDashboard.tsx

Routes: Not reachable from the80 registered route import closures

- Configured `/api/ai/insights`, line267; text; reference.

### client/src/components/dashboard/AICareerCoach.tsx

Routes: `/dashboard`, `/s/:label`

- Configured `/api/career-coach/recommendations`, line255; text; reference.
- Configured `/api/career-coach/recommendations`, line272; text; reference.
- Configured `/api/career-coach/recommendations`, line287; text; reference.

### client/src/components/content/LocalMediaRenderer.tsx

Routes: `/social-media`, `/advertising`, `/studio/:projectId`, `/studio`, `/s/:label`

- Configured `/api/generate/image`, line76; image; reference.
- Configured `/api/generate/audio`, line89; audio; reference.
- Configured `/api/generate-video`, line99; video; reference.

### client/src/components/content/ServerVideoGenerator.tsx

Routes: `/social-media`, `/advertising`, `/s/:label`

- Configured `/api/social/generate-video`, line304; video; reference.
- POST `/api/social/generate-music-video`, line949; video; fetch.

### client/src/components/content/AIImageGenerator.tsx

Routes: `/social-media`, `/advertising`, `/s/:label`

- Configured `/api/social/generate-image`, line201; image; reference.

### client/src/components/analytics/DataDenseAnalytics.tsx

Routes: Not reachable from the80 registered route import closures

- GET `/api/ai/insights?range=${timeRange}`, line238; text; fetch.

### client/src/components/advertising/CreativeVariantGenerator.tsx

Routes: `/advertising`, `/s/:label`

- POST `/api/advertising/generate-content`, line149; text; apiRequest.
