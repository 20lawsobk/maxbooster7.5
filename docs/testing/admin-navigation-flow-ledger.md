# Admin account navigation and shared-flow ledger

## Scope and evidence

Source snapshot: `16e53e0d64ceba3b10165dc99eeb65e619365bf4` (subsequent
inventory/report edits are not represented by that commit identifier). The
generated source inventory is in
[admin-domain-action-inventory.md](admin-domain-action-inventory.md); its
source hashes cover the current tracked page, route, and MaxCore Python files.
The inventory is a declaration map, not proof that an operation succeeds.

`client/src/App.tsx` declares 79 route patterns plus a not-found catch-all.
`Sidebar.tsx` declares 36 links: 30 shared destinations and six admin-only
destinations. At widths below 1024 px, `MobileBottomNav.tsx` presents Dashboard,
Studio, Marketplace, and Social, plus More; More opens the same sidebar and its
remaining destinations. The sidebar filters its six admin links using the
session's role. Direct routes remain separately declared in the router, so
visibility in navigation is not proof of authorization; server permissions
remain authoritative.

`tests/layout-navigation-accessibility-browser.test.mjs` ran against the actual
production stylesheet and bundled layout in Chromium on 2026-11-12: **12 passed,
0 failed**. It checks mobile drawer focus, Escape/Enter behavior, accessible
names, and desktop resize. It uses an ordinary-user layout fixture and does not
exercise admin navigation destinations.

The sealed source-app page run at
`reports/admin-gap-audit/2026-11-12/page80-rebased/page80.json` returned
**PASS_WITH_UNTESTED_CATEGORIES**: all 42 authenticated, 11 administrator, and
27 public route-render scenarios passed in Chromium. It also passed bounded
project CRUD/ownership, preference persistence, workspace ownership, press-kit
form save/reload/public projection/unpublish, ordinary login/session/logout,
and disposable admin password/MFA route assurance. The role and paid entitlement
were assigned only to synthetic rows in the runner's disposable database. Route
rendering does not certify material operations on every page or the intended
administrator's account.

The current source HTTP integration runner could not be rerun in this workspace:
its required `.pythonlibs/lib/python3.12/site-packages` directory is absent.
Older private-admin and paid/free HTTP receipts in
[admin-domain-acceptance.md](admin-domain-acceptance.md) are retained as
source-revision-specific evidence, not promoted to current-source passes.

## Shared destinations

The API examples below are literal page-level references or the real route
families used by the page. Refer to the linked domain inventory for registered
handlers, route mounts, and locally imported service/storage dependencies.
“Not accepted” means no current-source, intended-admin UI journey with saved
state and reload/re-authentication evidence is available; an endpoint
declaration alone is not a pass.

| Sidebar destination | Mobile entry | UI module and material workflow | Backend entry points | Saved result and current acceptance |
|---|---|---|---|---|
| `/dashboard` | Bottom bar | `pages/Dashboard.tsx` — overview, projects, insights, countdowns | `/api/dashboard/comprehensive`, `/api/projects`, `/api/ai/insights`, `/api/countdowns` | Overview is read-only; source records are owned by their domains. Not accepted end-to-end. |
| `/projects` | More | `pages/Projects.tsx` → `ProjectsPageImpl.tsx` — project/songwriting create, edit, duplicate, and open | `/api/projects`, `/api/studio/projects`, `/api/songwriting` | Project persistence and ownership have prior isolated HTTP receipts; UI parity on the intended admin and ordinary accounts is not accepted. |
| `/studio` | Bottom bar | `pages/Studio.tsx` — project editing, tracks/clips, audio processing, generation, render/export | `/api/studio/*`, `/api/studio/generation/*`, `/api/audio-processing/*`, `/api/audio-analysis/*` | Project/track CRUD has a prior scoped receipt. Audio files, rendered outputs, recovery, and real model generation are unverified or blocked; see operational blockers. |
| `/desktop-app` | More | `pages/DesktopApp.tsx` — desktop-client information/download entry | No page-level API literal found | No product state identified in the page-level scan. Distribution/download completion is not accepted. |
| `/analytics` | More | `pages/Analytics.tsx` — dashboards, anomaly review, performance reports | `/api/analytics/dashboard`, `/api/analytics/anomalies*` | Read/report state is source-backed; fresh authenticated UI, correctness, and reload are not accepted. |
| `/analytics/ai` | More | `pages/analytics/AIDashboard.tsx` — AI insights | `/api/ai/analytics/insights` | Depends on service/model availability; current model-backed result and persistence are blocked. |
| `/social-media` | Bottom bar | `pages/SocialMedia.tsx` — connections, drafts/posts, metrics, content insights | `/api/social/connections`, `/api/social/posts`, `/api/social/metrics`, `/api/social/platform-status` | Local draft state may be saved by shared routes; OAuth and publishing are provider mutations and were not attempted. |
| `/advertising` | More | `pages/Advertisement.tsx` — campaigns, audiences, fatigue reporting | `/api/advertising/campaigns`, `/api/advertising/generate-campaign`, `/api/advertising/audience-segments` | A saved draft is eligible for isolated acceptance; campaign launch/provider delivery was not attempted. Current UI persistence is not accepted. |
| `/playlist-pitching` | More | `pages/PlaylistPitching.tsx` — pitch drafts, curator/status details | `/api/playlist-pitching`, `/api/playlist-pitching/curators`, `/api/playlist-pitching/stats` | An unsent pitch draft has a prior scoped HTTP receipt. Provider delivery and current UI/reload parity are not accepted. |
| `/fan-hub` | More | `pages/FanHub.tsx` — subscriber CRUD/import, consent requests, messages | `/api/fan-hub/subscribers`, `/api/fan-hub/messages`, `/api/fan-hub/message` | Subscriber CRUD and an unsent campaign draft have prior scoped receipts. Consent delivery, imports, and fan messages were not attempted. |
| `/fan-memberships` | More | `pages/FanMemberships.tsx` — membership tiers, members, wallet/revenue views | `/api/fan-memberships/tiers`, `/api/fan-memberships/members`, `/api/fan-memberships/wallet-config` | Local tier/config persistence and payment-backed membership fulfillment are not accepted; no charge was made. |
| `/ar-intelligence` | More | `pages/ARIntelligence.tsx` — trend, catalog-gap, and release-timing analysis | `/api/ar-intelligence/trend-forecast`, `/api/ar-intelligence/catalog-gap`, `/api/ar-intelligence/release-timing` | Analysis output provenance, source freshness, and reload are not accepted for current accounts. |
| `/marketplace` | Bottom bar | `pages/Marketplace.tsx` — browse, producer profiles, merch/catalog and purchase entry | `/api/marketplace/producers`, `/api/marketplace/*`, `/api/merch`, `/api/storage/upload` | Owned merch CRUD has a prior scoped receipt. Asset storage, checkout, entitlement delivery, refunds, and payouts are unverified; no purchase was made. |
| `/royalties` | More | `pages/Royalties.tsx` — royalty summaries, platform breakdown, track and payment views | `/api/royalties`, `/api/royalties/platform-breakdown`, `/api/royalties/payment-methods` | A source-backed report is not settlement evidence. Reconciliation and payout actions are blocked pending attributable provider/ledger receipts. |
| `/distribution` | More | `pages/Distribution.tsx` — release drafts, platform status and submission | `/api/distribution/releases`, `/api/distribution/platforms/status` | Create/edit/reload/delete of an undispatched release draft has a prior scoped receipt. Distributor is reported not connected; submission/takedown were not attempted. |
| `/publishing` | More | `pages/Publishing.tsx` — publishing registrations and statistics | `/api/publishing`, `/api/publishing/stats` | Current saved-record ownership/reload and any external registration are not accepted. |
| `/sync-licensing` | More | `pages/SyncLicensing.tsx` — licensing opportunities and submissions | `/api/sync-licensing`, `/api/sync-licensing/stats` | Current saved-record ownership/reload is not accepted; external submissions are not permitted in this task. |
| `/merch` | More | `pages/MerchStore.tsx` — item CRUD, orders and sales summaries | `/api/merch`, `/api/merch/orders`, `/api/merch/stats` | Local catalog CRUD has a prior scoped receipt. Orders, checkout, shipping, refunds, and payout are not accepted; no charge was made. |
| `/invoices` | More | `pages/Invoices.tsx` — invoice CRUD/PDF and send action | `/api/invoices`, `/api/invoices/:id`, `/api/invoices/:id/pdf`, `/api/invoices/:id/send` | Invoice state, PDF persistence, and reload are not accepted. Sending is an external customer message and was not attempted. |
| `/contracts` | More | `pages/Contracts.tsx` — templates, owned contracts, timeline/signature status | `/api/contracts/templates`, `/api/contracts/my-contracts`, `/api/contracts/*` | Saved contract ownership/reload is not accepted. Signature/provider mutations were not attempted. |
| `/shows` | More | `pages/Shows.tsx` — event CRUD, setlists and statistics | `/api/shows`, `/api/shows/setlists`, `/api/venues` | Current account persistence/reload is not accepted; no external booking was attempted. |
| `/press-kit` | More | `pages/PressKit.tsx` — profile edit, photo upload, publish/unpublish | `/api/press-kit`, `/api/storage/upload` | A prior browser receipt exercised a fixture's form, saved-field reload, public projection, cache update, and unpublish. It is not current-source evidence for the intended account; storage-backed photo upload is unverified. |
| `/outreach` | More | `pages/OutreachCRM.tsx` — campaigns, pitches, follow-ups and AI pitch drafting | `/api/outreach/campaigns`, `/api/outreach/pitches`, `/api/outreach/follow-ups`, `/api/outreach/generate-pitch` | CRM persistence/reload is not accepted. External contact messages were not attempted; AI drafting awaits real model evidence. |
| `/collaborations` | More | `pages/Collaborations.tsx` — connections, invitations and shared projects | `/api/collaborations/connections`, `/api/collaborations/projects` | A private project create/list has a prior scoped receipt. Two-account invite, least privilege, revocation, and reload are not accepted. |
| `/workspaces` | More | `pages/Workspaces.tsx` — workspace members, roles, activity and presence | `/api/workspace/user/workspaces`, `/api/workspace/:id/members`, `/api/workspace/:id/roles` | A prior browser fixture verified workspace save/re-read, owner membership, and nonmember denial. It is not current-source intended-account acceptance. |
| `/release-countdown` | More | `pages/ReleaseCountdown.tsx` — countdown/task CRUD | `/api/countdowns`, `/api/countdowns/:id`, `/api/countdowns/:id/tasks/:taskId` | Current owned state and reload are not accepted. |
| `/career-coach` | More | `pages/CareerCoach.tsx` — goals, recommendations and assistant support | `/api/career-coach/goals`, `/api/career-coach/recommendations`, `/api/assistant/chat` | Saved-goal state and real recommendation provenance are not accepted; generated content awaits available model service. |
| `/assistant` | More | `pages/Assistant.tsx` — conversation history and text generation | `/api/assistant/history`, `/api/assistant/chat` | History/validation have a prior scoped receipt only. Real text generation, saved output, reload, and model provenance are blocked. |
| `/workflow-automations` | More | `pages/MusicWorkflowAutomations.tsx` — enable/configure/trigger workflows and view logs | `/api/music-workflow-automations`, `/api/music-workflow-automations/:id/config`, `/api/music-workflow-automations/trigger` | Configuration persistence and reload are not accepted. Triggers that message, publish, charge, or otherwise mutate external systems were not run. |
| `/verification` | More | `pages/Verification.tsx` — KYC status, document upload and verification steps | `/api/kyc/status`, `/api/kyc/documents`, `/api/kyc/start` | Identity-document handling and third-party verification require a designated non-production provider; no documents were uploaded. |

## Admin-only destinations and controls

`Sidebar.tsx` exposes these six links only when the authenticated session says
`role === "admin"`: `/admin`, `/admin/dashboard`, `/admin/autonomy`,
`/admin/security`, `/admin/content-sampler`, and `/admin/audit-log`.
`App.tsx` additionally declares `/admin/support`, `/admin/support/tickets/:ticketId`,
`/admin/kyc`, `/admin/training`, and `/admin/beat-money-loop`. The Admin page's
internal controls link to dashboard, KYC, security, support, training, and
autonomy; the dashboard route opens the money-loop tab. These are router
declarations and UI affordances, not proof of server authorization.

Admin UI workflow APIs and their registered handlers are enumerated separately
under the **administration** domain in the action inventory, including user
management, moderation, settings, payment bypass, security/audit, support,
training, KYC, tokens, webhooks, backups, and system controls. This ledger does
not execute those mutations. User deletion/suspension, payment bypass, kill
switches, support replies, KYC decisions, webhook retries, training jobs, and
system-setting changes require separate reversible-fixture approval and
attributable persistence evidence.

## Router-only, public, and unresolved declarations

The following are distinct from the 30 shared sidebar destinations:

- Public/auth and information routes include `/`, `/login`, `/forgot-password`,
  `/reset-password`, `/register`, `/register/payment/:tier`,
  `/register/success`, `/pricing`, `/features`, `/api-docs`,
  `/documentation`, `/about`, `/blog`, `/blog/:slug`,
  `/solo-founder-story`, `/security`, `/dmca`, `/terms`, `/privacy`, and
  `/help`. Public visibility and registration policy are independent.
- Authenticated routes without a top-level sidebar item include
  `/simplified-dashboard`, `/marketplace/beat/:beatId`,
  `/marketplace/producer/:producerId`, `/studio/:projectId`, `/show`,
  `/support/tickets/:ticketId`, `/storefront`, `/storefront/:slug`,
  `/store/:slug`, `/s/:label`, `/epk/:slug`, `/developer-api`, `/settings`,
  `/handle-link`, `/notifications`, and `/notifications/:id`. Some are
  linked from page-level controls or are record/detail routes.
- The not-found route is the router catch-all, not a product destination.
  Route-only declaration does not imply a navigation link.
- The generated source inventory reports **11 unresolved route declarations**.
  It also explicitly marks source files with no discovered mount, including
  `server/routes/admin/intelligence.ts`; active admin-intelligence handlers
  are declared in the mounted `server/routes/admin.ts`. Unmounted MaxCore
  worker/source candidates are not reachable UI operations.

## Overall acceptance

**NOT ACCEPTED; production readiness remains false.** This ledger maps current
navigation and source declarations but does not claim every shared workflow has
been executed. Full UI parity requires the intended authorized administrator
session and separate representative ordinary paid/free sessions in a
designated non-production environment. Current blockers and the limited
disposable-fixture receipts are recorded in
[admin-domain-acceptance.md](admin-domain-acceptance.md).
