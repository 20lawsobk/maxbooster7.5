# Growth, rights and remaining product surfaces — 2026-09-19

## Blocker list

Read-only current-source audit. Only this report was written; no app execution, heavy tests, configuration changes, live databases/providers, secret values or workflows were accessed. “Confirmed” means established by code, not a claim of observed production incidents. P1 blocks the named feature's production promise; it does not necessarily block an unrelated limited release. No P0 established here.

| ID | Classification / priority | Blocker | Affected release scope | Confidence |
|---|---|---|---|---|
| GR-1 | CONFIRMED defect / P1 | Fan campaign “send” records delivery without sending; the separate real broadcast path lacks durable recipient outcomes | Fan marketing campaigns and restart/retry-safe broadcasts | High |
| GR-2 | CAPABILITY GAP / P1 | Fan broadcasts have no application-level consent/suppression/unsubscribe lifecycle | Production artist-to-fan email marketing | High for application gap; provider-level suppression not verified |
| GR-3 | CAPABILITY GAP / P1 | Merch management has no order-ingestion/purchase producer behind its fulfillment UI | Selling/fulfilling physical merchandise inside this platform; catalog-only management is narrower | High within searched repository |
| GR-4 | CONFIRMED defect / P1 | Split-sheet amendments bypass allocation invariants and overwrite mutable signatures without revision-bound assent | Split-sheet execution through mounted contracts API | High |
| GR-5 | CONFIRMED defect / P1 | Revenue forecast API returns invented accuracy and substitutes assumptions for measured zero revenue without provenance | Mounted revenue forecast API and any consumer relying on its financial estimates | High; visible dashboard reachability not established |

### GR-1 — Sending and recording delivery are disconnected

**Entry → consumer:** `/social-media` is mounted in `client/src/App.tsx:205`; its Fan Campaigns tab renders at `client/src/pages/SocialMedia.tsx:4747-4748`. The action calls `/api/fan-campaigns/:id/send` and announces “Delivered” (`:5638-5650`); server mount is `server/routes.ts:8524`. The complete handler only counts subscribers, updates `status: "sent"` and returns success (`server/routes/fanCampaigns.ts:185-227`). There is no delivery call or enqueue operation in that handler.

**Related instance, same delivery-ledger root cause:** `/fan-hub` (`client/src/App.tsx:268`) uses a genuinely sending implementation: `server/routes/fanHub.ts:349-373` invokes the email service. However, all sends precede the single message insert (`:381-391`), with no durable recipient command/outcome. A process loss or insert failure can leave accepted mail unrecorded; retry resends the whole audience. Partial failures only produce aggregate counts (`:393-403`), not a recoverable failed-recipient list. This is distinct from the social-post recovery finding I6: these are email fan-marketing commands, not social platform publication.

**Impact:** the campaign UI can report a completed marketing operation when no email was attempted; actual broadcasts cannot reliably resume without duplicates. Provider acceptance is also not inbox delivery: `server/services/emailService.ts:789-809` returns a boolean, not recipient delivery events.

### GR-2 — Fan audience permission is not represented or enforced

**Entry → consumer:** `/fan-hub` subscriber creation accepts manually supplied email/source (`server/routes/fanHub.ts:16-24,98-114`). The audience schema has identity, tags and joined dates but no consent or suppression state (`shared/schema.ts:7186-7209`). Broadcast selects every subscriber belonging to the artist (`server/routes/fanHub.ts:312-320`), and the email asserts subscription without an unsubscribe link (`:336-345`). Its email wrapper only supplies addresses, content and sender (`server/services/emailService.ts:789-809`); no marketing preference lookup or application unsubscribe handling occurs there.

**Impact:** a manually imported/added contact is treated as sendable without evidence of permission; the application cannot enforce recipient withdrawal for this list. This is not I7's user-notification preference mismatch: fan contacts need not be registered users, and `emailPreferences` is a separate user-keyed table (`shared/schema.ts:5917-5928`). External provider suppression may exist, but source does not establish it or make it an artist-scoped consent lifecycle. Legal applicability, sender identity requirements and lawful basis require jurisdiction-specific review; this is not a legal-compliance certification.

### GR-3 — Merch catalog/order management has no order origin

**Entry → consumer:** `/merch` (`client/src/App.tsx:272`) loads catalog, orders and statistics (`client/src/pages/MerchStore.tsx:122-128`), creates products (`:133`), and updates order status (`:195-203`). The mounted router (`server/routes.ts:7677`) implements product creation (`server/routes/merch.ts:112-145`), order reads (`:246-261`) and status updates (`:265-347`), not order creation/checkout/import. Searches of server TypeScript for `merchOrders`, `merch_orders` and SQL insert references found no order insert producer; schema defines the order table (`shared/schema.ts:7422-7441`). This is a bounded repository absence, not proof that no external operator ever writes the database.

**Impact:** new customers cannot create physical-merch orders through the examined product, so fulfillment and revenue screens cannot become a complete selling workflow. This is distinct from beat marketplace payments/royalties already covered in commerce.md. A further acceptance requirement is financial semantics: merch “totalRevenue” currently sums all non-cancelled/non-refunded order totals, including pending orders (`server/routes/merch.ts:355-361`); a real ingestion implementation must distinguish paid, booked and collected amounts rather than inherit this as collected revenue.

### GR-4 — Split-sheet assent is neither atomic nor bound to a revision

**Entry → consumer:** `/contracts` mounts at `client/src/App.tsx:253`; its API family mounts at `server/routes.ts:7587`. The child endpoint `/api/contracts/split-sheets/:contractId/sign` reads a JSON signature array, edits one element, then replaces the full array with a predicate on ID only (`server/routes/contracts.ts:1391-1450`). Two participants signing the same snapshot can each receive success while the last writer erases the other's signature.

The creator-only amendment endpoint reads and pushes participants/signatures, then writes both arrays (`server/routes/contracts.ts:1490-1521`), preserving existing signatures despite changed participants/terms. Signature hashes include supplied signature, time and user ID, not the contract revision/content (`:1426-1430`). Adding a participant changes status but does not invalidate prior assent. These are instances of the same missing atomic, immutable revision model, not the collaborator-payout gap C4.

Allocation invariants also fail at this amendment boundary: creation has a sum-to-100 check (`server/routes/contracts.ts:1333-1341`), but add-participant checks only required-field presence and email format (`:1468-1487`) before appending, without finite numeric, individual range, aggregate total or duplicate participant validation (`:1506-1521`). For example, adding a positive allocation to an existing 100% sheet can persist an overallocated revision. The separate `/split-sheets/validate` route (`:1531-1559`) is not called by the mutation and cannot enforce its invariants. Remediation must atomically validate the complete proposed allocation on every creation/amendment, not merely repair signature storage or rely on optional client preflight.

**Impact:** accepted signatures can disappear or appear attached to amended economics never signed by prior participants, including invalid or overallocated participant sets. Scope precision: these child APIs are live under the mounted family, but no direct split-sheet UI call was found in the current Contracts page; do not claim a demonstrated click-through failure. The page's ordinary contract sign flow is separate (`client/src/pages/Contracts.tsx:375-394`). No conclusion about legal enforceability or actual fraudulent activity is drawn.

### GR-5 — Financial forecast statistics conceal absence of evidence

**Entry → consumer:** `server/routes.ts:7047` mounts `/api/revenue-forecast`; `server/routes/revenueForecast.ts:59-79` exposes accuracy through the imported `revenueForecastService`. With no compared forecasts the service returns 85% accuracy and 15 MAPE (`server/services/revenueForecastService.ts:214-234`); it also falls back to 15 when all actual revenues are zero (`:244-265`). Stream rate substitutes a constant for zero streams and for a measured zero revenue/stream ratio, then clamps the result (`:143-167`). Generation multiplies revenue by a fixed 70% royalty percentage (`:75,112`) without a rights-specific input.

**Impact:** consumers cannot distinguish observed accuracy/rates from assumptions; zero monetization can become a positive modeled rate. These are not claims that assumptions or scenario models are inherently wrong, but the return contracts do not identify these substitutions. Distinct from AM-2: that report covers unavailable authoritative AI endpoints; this mounted heuristic API returns successful, misleading financial data. `client/src/components/dashboard/RevenueForecast.tsx:274-304` contains a matching consumer, but repository search did not establish its current import into a mounted page. The blocker is therefore explicitly API-scoped, not a claim that this widget is currently visible.

## Repair playbooks

Each letter is a genuinely different implementation strategy, not a step in another strategy. Each includes preparation, implementation/migration, tests and acceptance. Recommendations are engineering choices, not guaranteed first-attempt fixes.

### GR-1 — Durable, truthful fan delivery

**A — Transactional outbox and recipient ledger (recommended; strongest local control, ongoing worker operations).**
1. Define campaign, recipient, provider-accepted and delivered states plus stable command keys.
2. Add campaign/recipient/outbox tables and migrate historical “sent” rows to provenance-qualified historical records, not invented deliveries.
3. Route both campaign and broadcast actions through one transactional enqueue; workers persist provider IDs and process authenticated delivery callbacks.
4. Test repeated commands, worker death before/after acceptance, DB failure, partial rejection and callback replay.
5. Accept only when UI totals reconcile to real recipient outcomes and retry targets unresolved recipients without blind whole-list replay.

**B — Provider-managed campaign execution (less in-house delivery infrastructure, provider coupling).**
1. Select a real marketing provider with campaign IDs, delivery exports and documented retry semantics.
2. Map artists/audiences and migrate campaign drafts to provider-backed records retaining local ownership.
3. Create/send provider campaigns with durable external IDs; reconcile callbacks and polling into local status.
4. Exercise lost responses, duplicate send requests, quota errors and delayed delivery events against an authorized test audience.
5. Accept when every “sent/delivered” count traces to provider evidence and uncertain outcomes remain explicitly pending.

**C — Durable workflow orchestration (strong recovery history, higher infrastructure cost).**
1. Define one long-lived workflow per campaign and one activity per recipient with external-effect reconciliation rules.
2. Migrate pending campaigns into versioned workflow inputs and retain historical evidence separately.
3. Implement retries, activity heartbeats, provider lookup and deterministic state transitions; connect both UI actions to workflow IDs.
4. Test orchestrator/worker restart at each send boundary and mixed provider outcomes.
5. Accept when workflows resume to reconciled completion and replay cannot report or create unsupported delivery.

**D — Relay service with acknowledgement protocol (isolates email operations, adds service boundary).**
1. Specify authenticated relay commands, tenant quotas, immutable recipient sets and command deduplication.
2. Implement a durable relay inbox plus recipient ledger; migrate campaign execution ownership to the relay.
3. Persist relay command IDs before dispatch and expose accepted/delivered/rejected progress to the existing pages.
4. Test network partitions, duplicate relay requests and relay restart after provider acceptance.
5. Accept when local and relay records reconcile and fan UI never equates command acceptance with delivery.

### GR-2 — Consent and suppression

**A — First-party consent registry (recommended; explicit control, regulatory/product maintenance).**
1. Define artist/channel-scoped lawful-basis, consent evidence, withdrawal and retention requirements with qualified review.
2. Add permission/suppression events and migrate existing contacts to evidence-unknown rather than assume consent.
3. Implement verified enrollment, signed unsubscribe links and last-moment suppression checks in every marketing sender.
4. Test withdrawal during queued delivery, import duplicates, token tampering and re-enrollment with authentic evidence.
5. Accept only when every eligible recipient has documented permission and withdrawals stop subsequent marketing sends.

**B — Marketing provider as consent authority (faster operational maturity, vendor dependence).**
1. Choose a provider supporting required consent receipts, list isolation and suppression callbacks.
2. Import contacts with provenance; obtain missing permission through an appropriate enrollment process rather than unsolicited confirmation blasts.
3. Use provider forms/unsubscribe and query or synchronize authoritative eligibility before dispatch.
4. Test callback loss, offline synchronization, suppression overrides and artist separation.
5. Accept when provider and application eligibility agree and unsubscribed contacts cannot be reactivated by ordinary imports.

**C — Dedicated preference-center service (reusable across products, additional service ownership).**
1. Specify recipient identifiers, artist scopes and channel purposes independent of account login.
2. Migrate consent evidence into a central event-backed preference store.
3. Build a verified preference portal and require a short-lived eligibility decision at each delivery boundary.
4. Test stale decisions, identity changes, cross-artist requests and revocation races.
5. Accept when all marketing entrypoints enforce the same current recipient decision with auditable evidence.

**D — Customer-owned audience-system federation (best for established artist CRM users, integration complexity).**
1. Define supported external CRM consent models, authoritative IDs and disconnect behavior.
2. Link contacts to authentic CRM records and migrate unknown local permission to unresolved status.
3. Implement signed enrollment/withdrawal synchronization plus fresh eligibility checks; render CRM-provided unsubscribe paths in messages.
4. Test reconciliation lag, deleted contacts, reconnects and conflicting preference updates.
5. Accept when end-to-end withdrawal propagates before subsequent sends and local edits cannot override authoritative suppression.

### GR-3 — Complete merchandise ordering

**A — Native physical-commerce workflow (recommended for native checkout promise; largest implementation burden).**
1. Define tax, shipping, returns, variants, stock reservation and payment-settlement requirements separately from digital beats.
2. Add immutable order lines, money/currency fields, reservations and payment/fulfillment events; migrate catalog and qualify existing orders.
3. Build buyer checkout, authenticated payment event ingestion, atomic stock reservation and shipment/refund reconciliation.
4. Test oversell concurrency, repeated payment events, abandoned checkout, partial shipments and returns.
5. Accept on an authorized end-to-end purchase whose stock, payment, shipment and net revenue reconcile.

**B — Commerce-platform connector (fast mature checkout, platform fees and synchronization).**
1. Select an actual physical-commerce platform and document ownership of product, payment and inventory data.
2. Map existing products to remote variants and import verified historical orders with stable source IDs.
3. Provide connected checkout and signed order/fulfillment/refund webhook ingestion with periodic reconciliation.
4. Test duplicate/out-of-order events, reconnect, SKU changes and partial refund/shipment.
5. Accept when every remotely paid order appears once locally and local revenue matches authoritative settlement definitions.

**C — Print-on-demand merchant integration (reduced stock operations, margin/provider limitations).**
1. Choose a real provider and settle merchant-of-record, production, shipping and return responsibilities.
2. Map designs/variants/prices to provider catalog; migrate stock semantics to provider availability where applicable.
3. Implement buyer ordering, durable production submissions and payment/shipment event ingestion.
4. Test unavailable variants, production rejection, lost acknowledgement, refunds and tracking updates.
5. Accept after an authorized fulfilled order with traceable customer payment, production cost and artist proceeds.

**D — External-order management/import workflow (appropriate for multichannel sellers; not native checkout).**
1. Define supported external stores and documented order-source/payment evidence requirements.
2. Add staged imports, source IDs and explicit paid/unpaid/unknown financial states; migrate legacy totals accordingly.
3. Implement authenticated order imports/connectors, deduplication, inventory reconciliation and supported fulfillment exports.
4. Test repeat files/events, conflicting edits, missing payment evidence and partial fulfillment.
5. Accept when a real external purchase flows through local fulfillment/reconciliation; describe the product honestly as connected order management, not nonexistent native checkout.

### GR-4 — Immutable, concurrent-safe split agreements

**A — Normalized revision/signature tables (recommended; robust invariants, schema migration).**
1. Define canonical agreement content, revision identity and allocation constraints: finite numeric percentages in 0–100, unique participant identities and a 100% total using documented precision.
2. Migrate arrays into revision/participant/signature rows, preserving historical evidence and flagging invalid allocations for explicit correction rather than silently normalizing them.
3. Transactionally validate the entire proposed allocation on every creation/amendment under a per-agreement lock; enforce row constraints and unique identities, then create an unsigned revision and require revision/content-bound signatures.
4. Test simultaneous signers/amendments, stale assent, duplicate identities, missing/non-numeric/non-finite percentages, negative/over-100 values and under/overallocated totals.
5. Accept when invalid amendments cannot commit, concurrent valid amendments preserve all canonical constraints, no successful signature disappears and activation requires all parties' assent to that exact valid revision.

**B — Optimistic concurrency on versioned documents (smaller migration, explicit conflict handling).**
1. Specify document version, canonical hash and conflict/retry semantics alongside finite 0–100 percentages, unique participant identities and a precisely represented 100% total.
2. Add revision/version columns and immutable historical snapshots; flag legacy invalid allocations without rewriting signed evidence.
3. Validate the entire proposed participant set and compare-and-swap every creation/amendment/signature command atomically; on conflict reload and revalidate, rejecting stale assent and generating an unsigned revision for changed terms.
4. Force interleaved writes and test duplicate identities, non-numeric/non-finite inputs, range violations and invalid totals; verify conflicts and validation errors leave stored content unchanged.
5. Accept when every committed revision satisfies canonical allocation constraints despite concurrent amendments and all persisted assent matches the exact accepted version.

**C — Event-sourced agreement aggregate (best audit history, greater complexity).**
1. Define proposed, revised, signed and activated events with expected sequence and canonical allocation invariants: finite 0–100 percentages, unique participants and an exact total under documented precision.
2. Migrate agreements as provenance-labelled snapshots, marking invalid legacy allocations as requiring correction rather than treating them as valid executable revisions.
3. Validate each complete proposed allocation inside serialized creation/amendment commands before atomic expected-sequence append; count signatures only for their immutable content hash.
4. Test parallel commands, replay/rebuild, duplicate participants, non-numeric/non-finite/range-invalid percentages and invalid totals, including amendment after partial/full signing.
5. Accept when replay preserves authentic signing events without transferring assent and no creation/amendment event can establish a revision violating canonical allocation constraints.

**D — E-signature envelope authority (external evidentiary tooling, provider cost/lock-in).**
1. Select a provider meeting identity/envelope requirements and define local canonical allocation rules: finite 0–100 percentages, unique participants and a 100% total under documented precision.
2. Map participants and migrate sheets as historical records, flagging invalid allocations; only validated new unsigned revisions are eligible for envelopes.
3. Atomically validate and reserve each creation/amendment revision before durable envelope submission; recheck revision identity on callbacks, bind artifacts/hashes to that revision and supersede rather than mutate executed envelopes.
4. Test callback replay/order, signer mismatch, concurrent amendments/completion, duplicate participants, non-numeric/non-finite/range-invalid percentages and invalid totals before provider submission.
5. Accept when invalid allocations cannot become executable revisions or submitted envelopes, activation requires verified assent to the same valid revision, and prior signed artifacts remain immutable and retrievable.

### GR-5 — Evidence-bearing financial forecasts

**A — Explicit empirical/scenario model contract (recommended; retains useful heuristic work without invented certainty).**
1. Define observed, assumed, insufficient-data and measured-accuracy result types with sample windows and currency.
2. Migrate stored forecasts with model/provenance versions; do not backfill fabricated accuracy.
3. Preserve real zero rates, expose optional assumptions as scenarios, derive royalty terms from authoritative rights inputs and return unavailable accuracy until comparisons exist.
4. Test no data, zero actuals, zero monetization, sparse histories, rate outliers and royalty changes.
5. Accept when each numeric claim has evidence or an explicit user-visible assumption and zero-actual scoring uses a documented valid metric.

**B — Statement-based cash forecast (strong financial grounding, statement lag).**
1. Define authoritative statements, settlement periods, currencies and contractual deductions.
2. Build reconciled statement ingestion and migrate forecast inputs from mixed analytics into typed cash/royalty series.
3. Forecast cash by settlement cohort and compute backtests only over closed periods, with separate stream scenarios.
4. Validate against authorized historical statements including reversals and delayed settlement.
5. Accept when forecast/actual comparisons reproduce ledger totals and no-history results convey absence of evidence.

**C — Versioned forecasting service with calibration (more modeling capability, operating/model risk).**
1. Specify input provenance, zero-inclusive scoring, model validation and output uncertainty requirements.
2. Publish a versioned service contract and migrate existing forecast records with source/model metadata.
3. Implement trained/calibrated forecasting and out-of-sample evaluation; adapters return explicit insufficient-data states rather than constants.
4. Run temporal holdouts and drift tests including non-monetized artists; verify royalty calculations independently.
5. Accept when reported accuracy is reproducible from actual holdouts and the API returns calibrated, provenance-labelled results.

**D — Transparent financial planning engine (user-controlled assumptions, not automated predictive accuracy).**
1. Define a scenario-planning product with editable stream rates, rights shares and uncertainty bounds.
2. Migrate legacy estimates as unverified scenarios while retaining observed actuals separately.
3. Implement auditable assumption sets and deterministic recalculation; build a separate measured scenario-versus-actual evaluation pipeline.
4. Test zero assumptions, currency precision, assumption revisions and actual reconciliation.
5. Accept when users can reproduce each result from named inputs and any displayed accuracy comes from real comparisons, not planning defaults.

## Examined-surface inventory and unexamined boundaries

Started from mounted families in `client/src/App.tsx:253-277` and advertising `:206`; followed actual page requests into mounted routers, not merely historical task descriptions. Read existing blocker lists in commerce, integrations, AI/media, product/autonomous, security, deployment, data/runtime, coverage-gaps and scanner reports to avoid restating their root causes. Proposed/cancelled tasks supplied by the parent were not evidence.

| Surface | Source examined / conclusion | Residual boundary |
|---|---|---|
| Shows/live performance | `client/src/pages/Shows.tsx:119-217`; `server/routes/shows.ts` CRUD, stats and setlist ownership checks, including `:369-405` | Planner/storage reviewed, not real venue booking, ticket settlement, venue integrations or tour logistics certification |
| Merch | Page queries/mutations, mounted router, order schema and producer searches; GR-3 | No live checkout/provider/warehouse evidence |
| Publishing | `server/routes/publishing.ts:15-49,91-119,134-184` validates split totals, starts registration pending, and owner-scopes writes | Do not re-report already-fixed split validation. PRO registration verification, royalty statements and chain of title not certified |
| Sync licensing | `client/src/pages/SyncLicensing.tsx:86-144`; `server/routes/syncLicensing.ts` owner CRUD, public browse/inquiry `:208-294`, owner inquiry workflow `:297-400` | Inquiry/listing tracking is not proof of executed license, cleared masters/compositions, invoicing or exclusive-rights enforcement |
| Contracts/splits | Ordinary page signing and contracts router; template service signing; split-sheet mutations; GR-4 | Counterparty identity/legal validity, jurisdiction templates, tax forms and all invoice lifecycle paths not exhaustively reviewed |
| Collaboration/team permissions | `server/routes/collaborations.ts` connection endpoints; `server/routes/workspace.ts:34-80,219-238`; `server/services/workspaceService.ts:145-201` | Route-level membership/admin checks exist; no blanket authorization defect inferred from a service without checks. Full role inheritance, custom-role escalation, approval workflows, SSO and invitation lifecycle remain unverified |
| Playlist pitching | `client/src/pages/PlaylistPitching.tsx`; `server/routes/playlistPitching.ts` curator list and pitch/status CRUD `:179-295` | Local tracking/status entry is not verified curator receipt or placement; curator directory freshness and external submission agreements unverified |
| Fan CRM/marketing | FanHub, FanCampaigns tab/router, email wrapper and schemas; GR-1/2. Outreach page/router inspected, including explicit unavailable handling `server/routes/outreach.ts:378` | Provider suppression/deliverability, bounce/complaint handling and broader workflow-automation email consumers not exhaustively traced |
| Fan monetization | `server/routes/fanMemberships.ts` tier management, members/revenue `:258-385`, loyalty config/leaderboard; page query consumers | Membership acquisition, recurring billing reconciliation and wallet redemption not end-to-end traced; no invented missing-producer claim made |
| Advertising creation/delivery/spend | `client/src/pages/Advertisement.tsx:402-448,548-561,710-825`; `server/routes/advertising.ts:330-365,865-922`; `server/services/advertisingDispatchService.ts:1-220` | Current code explicitly uses organic posting, planning budgets and zero paid spend. Do not re-report the fixed budget-as-spend issue. Paid-media buying/billing/budget enforcement is not established by organic posting; provider delivery/metric aggregation, attribution and all autopilot rules remain verification boundaries |
| Revenue forecast/aggregation | Mounted forecast router and `revenueForecastService`, isolated widget reference; GR-5 | No claim of mounted widget visibility; cross-platform analytics ingestion, deduplication, FX/currency/timezone semantics and all aggregate dashboards not exhaustively audited |
| Press kit/release countdown/workflow automations | App route inventory only | Rendering, public sharing, automation delivery and external integrations not deeply audited in this report |

This is not a full-platform certification. Production acceptance requires authorized integration evidence for chosen remediations; static source cannot establish real email delivery, consent validity, legal assent, fulfillment or calibrated predictive accuracy. No screenshots were taken because the assignment explicitly restricted this to source review and report writing.