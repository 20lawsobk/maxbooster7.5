# Marketplace / StorefrontBuilder scoped review

## Scope and evidence

Owned files only: Marketplace.tsx, StorefrontBuilder.tsx, and the page-specific regression suite. Backend inspection was read-only. No purchase, publish, API mutation, database write, workflow restart, or live provisioning was performed.

Implemented:
- User-keyed private reads with explicit endpoint functions (cache identity is not appended to request URLs), and identity-keyed editor/page drafts.
- Explicit marketplace section loading/error/retry states and deep-link not-found notice; storefront list/template/tier errors no longer imply successful empty responses.
- Validated list envelopes, authentic empty license templates rather than fabricated saved defaults, canonical encoded share URLs.
- Corrected guest checkout's undefined navigation function.
- Corrected promotion payload from ignored storefrontId to the route's slug, and campaign display from nonexistent videos/platforms to Veo assets.
- Removed unsupported escrow-protection advertising and disabled unsupported release action.
- Creation no longer claims a draft is live; domain claim/reservation no longer claims DNS/TLS readiness; asset upload explains Save is still needed. Clipboard success now awaits the operation and handles denial.
- Initial storefront selection loads its existing customization rather than leaving default editor values.
- Asset upload cannot apply to a different storefront after a selection change, and saving waits for an in-progress image upload.
- Average sale price reads the actual averageOrderValue contract. Unsupported conversion/trend/top-beat/distribution values are labelled unavailable rather than invented zero results.

## Read-only backend contract trace / coordinator follow-up

- server/routes/marketplace.ts: beats returns an array, producers wraps producers, purchases/my-beats/recommendations/licenses/contracts/collaborations/affiliates/escrow return lists. server/routes/merch.ts: owner product/order arrays and stats object.
- server/routes/storefront.ts: owner list/template/tier arrays; create/customize/publish return storefront records; delete returns success. Public storefront requires active AND public. Customization upload returns url.
- server/routes/socialMedia.ts promote-storefront selects by slug (otherwise first owned storefront); server/services/veoMusicService.ts returns success/campaign/assets, not campaign/videos/platforms.
- server/services/marketplaceService.ts getSalesAnalytics only returns totalRevenue, totalSales, averageOrderValue, recentSales. Weekly trends, conversion, license distribution and rankings are absent. Coordinator should establish supported analytics capabilities, and verify sale aggregation/monetary units and fulfillment statuses; this pass did not change accounting.
- Follow-up service ownership granted: getUserListings, getListingsByProducer, getUserPurchases and getSalesAnalytics now throw safe errors instead of masking actual read failures as empty lists/zero metrics. Successful empty results and all monetary arithmetic are unchanged. getListing, browseListings, getUserOrders and getUserSales already threw on errors and were left unchanged. Payment execution and post-payment ancillary catches were not edited.
- Shared storage still swallows underlying errors (line ranges below), so actual database failures remain indistinguishable until the coordinator fixes those catches. Service changes alone cannot recover errors already discarded by storage.
- Escrow endpoint returns pending/escrow order records, not UI held/released/disputed transaction semantics or buyer/seller/title enrichment; release explicitly returns 501. UI now states unsupported, but historical record enrichment and supported status/summary semantics need backend coordination. No funds actions executed.
- Platform domain claim writes an active domain row and pending certificate projection; it does not prove external registrar ownership or HTTPS reachability. Review server/routes/storefrontDomains.ts provisioning semantics and DNS child panel claims separately. This pass does not change registration/payment/domain infrastructure.

## Verification boundaries

Lightweight unit regressions exercise real extracted list loaders/canonical URL function, parse both TSX files, and assert cache/state/promotion contracts. No browser or signed-in UI verification was performed by this parallel implementation agent; the coordinator owns preview/test execution.

Executed: targeted Vitest page-contract + existing marketplaceCart suites, **19/19 passed**; existing canonical-link Node suite, **2/2 passed**. Scoped diff whitespace check passed. No full build/typecheck was run (both existing pages retain their pre-existing ts-nocheck).

Follow-up service regressions: **35/35 passed** across page-contract and service-read suites. Service-read tests execute only AST-extracted real read methods and registered GET callbacks in an isolated VM, avoiding backend module/provider/database initialization. They cover storage/profile/tier failures, genuine empty results, existing analytics arithmetic on successful rows, and sanitized HTTP 500 responses from registered `/beats` (anonymous/producer), `/my-beats`, `/purchases`, `/sales-analytics`, `/producer-analytics` (listing/sales failures), and `/producers/:producerId` handlers. No route files were edited.

### Exact shared-storage coordinator handoff

At inspection, server/storage.ts:
- `getBeatListings`: method lines **3125–3303**, failure catch **3299–3302** returns `[]`. Minimal change: retain warning and replace catch's return with rethrow; leave successful mapping and empty query result untouched.
- `getUserOrders`: method **3683–3716**, failure catch **3712–3715** returns `[]`. Same minimal catch-only rethrow; preserve order projection, query and successful empty results.
- `getSellerOrders`: method **3718–3731**, failure catch **3727–3730** returns `[]`. Same minimal catch-only rethrow; preserve seller filters/limit and successful empty results.
- `getUser` (lines **153–159**) already propagates `_retryQuery` failure and needs no change for this service chain.
- Additional page-read follow-ups, outside the direct four changed service methods: `getProducers` catch **2461–2464** returns `[]`; `getBeatListing` catch **3364–3367** returns `null`. `getBeatListing` also serves payment/ancillary paths, so assess those call sites before changing it; do not accidentally turn a post-payment ancillary error into reported payment failure.

Not verified end-to-end: checkout/payment/returns, cart persistence, audio previews/analysis, uploads/bulk edit, licensing/contract editor/viewer, collaborations/follow, affiliates, merchandise order fulfillment, PayoutDashboard, BogoPromotionsManager, StorefrontDnsZoneManager, memberships/billing, domain ownership/DNS/TLS, social campaign generation, publish/unpublish/delete. Child panels were not edited. Domain availability and slug suggestion races remain follow-up review candidates. This is not a page-ready claim.

Subscription pricing was untouched: Monthly $49, Yearly $468, Lifetime $699, 90-day guarantee.
