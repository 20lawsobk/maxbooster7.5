# Active application route inventory

Source: TypeScript AST traversal of `client/src/App.tsx`, 2026-10-17.
Observed **80 Route declarations**, including the catch-all. This inventories
the root application router, not every child panel or server/custom-host route.
No row is certified production-ready. Existing review documents record partial
fixes, focused checks and remaining backend/acceptance work.

## Partial work in this pass

| Component | Routes |
|---|---|
| Login | /login |
| Register | /register |
| ForgotPassword | /forgot-password |
| ResetPassword | /reset-password |
| Dashboard | /dashboard |
| SimplifiedDashboard | /simplified-dashboard |
| Projects | /projects |
| SocialMedia | /social-media |
| Advertisement | /advertising |
| Marketplace | /marketplace; /marketplace/beat/:beatId |
| Distribution | /distribution |
| Pricing | /pricing |
| Terms | /terms |
| Privacy | /privacy |

StorefrontBuilder is a reviewed child component, **not** evidence that the
public Storefront page or its purchase flows have been reviewed.

## Remaining routed boundaries (not certified by this pass)

| Component | Routes |
|---|---|
| Landing | / |
| RegisterPayment | /register/payment/:tier |
| RegisterSuccess | /register/success |
| DesktopApp | /desktop-app |
| AIDashboard | /analytics/ai |
| Analytics | /analytics |
| DeveloperApi | /developer-api |
| ProducerProfilePage | /marketplace/producer/:producerId |
| Royalties | /royalties |
| Studio | /studio/:projectId; /studio |
| ShowPage | /show |
| Subscribe | /subscribe/:tier |
| SecurityDashboard | /admin/security |
| AuditLogPage | /admin/audit-log |
| SupportTicketDetail | /admin/support/tickets/:ticketId |
| SupportDashboard | /admin/support |
| CustomerSupportTicket | /support/tickets/:ticketId |
| KYCReview | /admin/kyc |
| TrainingDashboard | /admin/training |
| ContentSampler | /admin/content-sampler |
| AdminDashboard | /admin/dashboard; /admin/beat-money-loop |
| Admin | /admin |
| Settings | /settings |
| Features | /features |
| API | /api-docs |
| Documentation | /documentation |
| About | /about |
| Blog | /blog |
| BlogPost | /blog/:slug |
| SoloFounderStory | /solo-founder-story |
| SecurityPage | /security |
| DMCA | /dmca |
| Onboarding | /onboarding |
| Help | /help |
| Storefront | /storefront; /storefront/:slug; /store/:slug |
| StorefrontShortLink | /s/:label |
| AdminAutonomy | /admin/autonomy |
| Verification | /verification |
| Contracts | /contracts |
| Workspaces | /workspaces |
| Collaborations | /collaborations |
| CareerCoach | /career-coach |
| Assistant | /assistant |
| ReleaseCountdown | /release-countdown |
| Invoices | /invoices |
| HandleLink | /handle-link |
| NotificationDetail | /notifications/:id |
| Notifications | /notifications |
| MusicWorkflowAutomations | /workflow-automations |
| Shows | /shows |
| FanHub | /fan-hub |
| FanMemberships | /fan-memberships |
| ARIntelligence | /ar-intelligence |
| OutreachCRM | /outreach |
| MerchStore | /merch |
| PressKit | /press-kit |
| PlaylistPitching | /playlist-pitching |
| Publishing | /publishing |
| SyncLicensing | /sync-licensing |
| PublicPressKit | /epk/:slug |
| NotFound | unmatched routes |

## Convergence gates

Keep authentication, billing, data-model and common-service edits under an
explicit single owner. Shared production build/typecheck and runtime rehearsal
must follow converged patches; earlier green results do not validate these edits.
Fixture tests are not live integration, concurrency, accessibility, or provider
verification. No deployments, live provider transactions or migrations are
part of this inventory.
