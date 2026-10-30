---
name: LabelGrid real API surface
description: Confirmed endpoint paths, auth, and data shape facts for LabelGrid's public API (server/services/labelgrid-service.ts), verified against LabelGrid's own OpenAPI spec — not assumptions
---

## Base URL
The real public API is served entirely under `/api/public`, with NO version segment
(not `/v1/...`). `normalizeBaseUrl()` in `labelgrid-service.ts` enforces this — always
route new/fixed endpoints through it rather than hardcoding a path prefix.

## Auth
Plain `Authorization: Bearer <token>` — no extra headers, no API-key scheme, confirmed
via the OpenAPI spec's `securitySchemes`. (Compare/contrast: MaxCore uses this same
Bearer-only scheme too — see maxcore-auth-header.md — but that's a coincidence between
two unrelated services, not evidence this is a universal convention worth assuming
elsewhere.)

## Confirmed NOT to exist (don't reintroduce these assumptions)
- No cross-industry artist search. `GET /artists?filter[artist_name]=` only searches
  the AUTHENTICATED ACCOUNT'S OWN ROSTER, never other labels' artists.
- No `/artists/:id/platforms` sub-resource. Platform/DSP data lives directly as fields
  on the Artist object returned by `GET /artists/{id}`.
- No artist-scoped release-listing endpoint. `GET /releases` only filters by
  `is_live` / `label_id` / `barcode_number` / `cat` — there is no `artist_id` filter.

## Artist DSP field shapes (for platform-presence / auto-discovery mapping)
`ArtistData` has TWO different kinds of DSP fields — don't conflate them:
- **Native ID fields** (high confidence, already a bare platform ID):
  `spotify_artist_id`, `apple_artist_id`.
- **Profile URL fields** (need extraction, lower confidence): `deezer_url`,
  `tidal_url`, `amazon_url`, `soundcloud_url`, `bandcamp_url`. These map to this
  project's `artist_profiles` schema columns `tidalArtistId`, `soundcloudArtistId`,
  `amazonMusicArtistId` etc. (exact camelCase — verify against `shared/schema.ts`
  before adding a new field, don't assume a naming pattern holds).
- LabelGrid search results are only read downstream via `.platforms` / `.id` / `.name`
  — safe to leave `genres`, `verified`, `imageUrl` unset/honest-default rather than
  guessing values LabelGrid doesn't actually provide.

## Provider config
The `dsp_providers` DB table (real table, NOT `distribution_providers`) has no
`apiBase`/`requirements` columns and currently has zero LabelGrid rows in this
project's Neon DB — the DB-driven config-override branch in `loadConfig()` is dead
code for LabelGrid specifically; don't assume a stale DB row is shadowing a code fix
without checking row existence first.

## Dev/prod token split
Constructor prefers `LABELGRID_TEST_API` over `LABELGRID_API_TOKEN` when
`NODE_ENV !== "production"`. As of the write-up, BOTH tokens return a clean 401
Unauthorized against the correct `/api/public` path — this is an account-side
LabelGrid issue (activation/allowlisting), not a code bug; confirmed via both direct
curl and the live service after fixing the base URL, circuit breaker, and axios
adapter bugs (see axios-adapter-wrapping-gotcha.md and
circuit-breaker-fallback-masks-errors.md — this integration is what surfaced both).

**Root cause found (Sep 2026): a `wpp_` prefix means "wrong token type", not "wrong
scope".** Both `LABELGRID_API_TOKEN` and `LABELGRID_TEST_API` were, at the time,
tokens starting with `wpp_` — confirmed live by calling `/api/wpp/me` (see section
below) with each: they authenticated successfully there (`{"status":"authenticated",
"plan":{"wpp_enabled":true},...}`), while the SAME tokens 401 on `/api/public/me`.
These are WordPress-plugin-connection tokens, minted by whatever LabelGrid dashboard
flow issues credentials for connecting a WP site (`label_ids` came back `null` —
not even tied to a specific label's content yet). They cannot ever authenticate
against `/api/public/*` — this is a different credential type issued by a different
dashboard flow, not a checkbox/scope toggle on the same token. Before spending more
time on a LabelGrid 401, check the token's prefix first: `wpp_...` → wrong flow,
go find the general Developer/API Tokens section instead of any "Connect WordPress
Plugin" flow. A genuine `/api/public` personal access token in this account was
previously confirmed to be a 3-segment RS256 JWT with no such prefix (see the JWT
scope section below) — so the two token FORMATS are visibly distinguishable on
sight (JWT-shaped vs `wpp_`-prefixed opaque string) even before making a network call.

## Independent confirmation via LabelGrid's own official tooling (Sep 2026)
LabelGrid publishes an official, MIT-licensed npm workspace at `github.com/labelgrid/labelgrid-mcp`
(org account, not a random namesake) containing `@labelgrid/cli`, `@labelgrid/mcp`, and the shared
`@labelgrid/core` HTTP client. This is a genuinely useful diagnostic instrument, distinct from
reading the OpenAPI spec or the WP plugin: `npx -y @labelgrid/cli@latest auth whoami --json
--api-url https://api.labelgrid.com/api/public` sends a real request through LabelGrid's own
first-party client (not this project's code) and is the most authoritative possible check of
whether a given `LABELGRID_API_TOKEN` value is valid — it reproduced the exact same
`TOKEN_INVALID` / 401 this project's code gets, closing off any remaining doubt that the 401 was
caused by something in our request construction. Reach for this CLI check before re-deriving the
diagnosis from scratch next time. Note: without `--api-url`, the CLI picks up this project's own
`LABELGRID_API_URL` env var, which is stored bare (`https://api.labelgrid.com`, no `/api/public`
suffix) — that produces a misleading generic `NOT_FOUND` 404 instead of the real 401, so always
pass `--api-url .../api/public` explicitly when using the CLI here.

Their CLI docs also state plainly: "API access is part of LabelGrid's API plans" (a
plan/tier-gated entitlement, not merely a token scope checkbox) and give an exact dashboard path
for minting a real token: **Profile → API Tokens**. This corroborates the "API features enabled
on your account" prerequisite noted below from the sandbox docs — a `wpp_`-prefixed token may be
the only thing this account can currently generate precisely because its LabelGrid plan doesn't
include full `/api/public` access, not because of a UI navigation mistake.

**Correction (re-checked Sep 2026):** the help site is NOT universally Cloudflare-blocked —
`https://help.labelgrid.com/en/developers/api-overview` fetched cleanly via plain webFetch with
full content. The earlier `/en/integrations/api-overview` path now 404s (page moved/renamed);
use the `/en/developers/...` path going forward. That page spells out the plan gate precisely:
API + sandbox access require an **active, paid API plan billed annually** — the standard 7-day
free trial does NOT include API/sandbox access, and API plans have no trial period of their own.
It also gives exact token-minting URLs: production `https://app.labelgrid.com/user/profile/api-tokens`,
sandbox `https://frontend-sandbox.stg.labelgrid.com/user/profile/api-tokens` (separate token per
environment, consistent with the sandbox-vs-prod section below). If a future check needs this
page again, just webFetch it directly — no login/bypass needed.

## Authoritative spec + decisive 401 isolation test
The real machine-readable OpenAPI 3.1 spec is public at `https://api.labelgrid.com/docs/api.json`
(~1MB; the human-facing Stoplight page at `/docs/api` is generated from it) — parse
it directly with fetch+JSON.parse for exact paths/schemas instead of guessing or
trusting old notes. It mechanically confirms `servers: ["https://api.labelgrid.com/api/public"]`
and `securitySchemes.http = {type: "http", scheme: "bearer"}`.

The spec exposes `GET /me` (tag "User Info") — the minimal possible authenticated
call, zero query params/business logic. A bare `fetch()` with no project code
involved, using both `LABELGRID_API_TOKEN` and `LABELGRID_TEST_API`, returns a clean
`{"message":"Unauthorized"}` 401 from this endpoint too. Use this pattern first
whenever a LabelGrid integration bug is suspected: it isolates "is the token/account
valid at all" from every other variable (our axios wrapper, request shape, endpoint
logic) in one cheap call, and it decisively cleared our own code of suspicion here.

## Sandbox vs. production are separate stacks with separate tokens
Confirmed from the docs prose (not the prod OpenAPI spec, which only lists the prod
server): production tokens are minted at `app.labelgrid.com/user/profile/api-tokens`
and are for `api.labelgrid.com`; sandbox tokens are minted separately at
`frontend-sandbox.stg.labelgrid.com/user/profile/api-tokens` and are for the
DIFFERENT host `api-sandbox.stg.labelgrid.com` (own OpenAPI doc at
`/docs/api` on that host, not fetched/parsed yet). A sandbox-minted token will not
authenticate against the production host or vice versa. Sandbox additionally
requires LabelGrid support to IP-allowlist the caller — from this project's outbound
IP, a bare fetch to `api-sandbox.stg.labelgrid.com` fails at the transport level
(`fetch failed`), not even reaching a 401, consistent with not being allowlisted.
Docs also separately call out "API features enabled on your account" as its own
prerequisite, independent of token validity — a real account could have a
well-formed, unrevoked token and still 401 if that entitlement isn't on. Any future
LabelGrid 401 triage should ask, in order: (1) is this token prod or sandbox, (2)
does the host match, (3) is the sandbox caller IP allowlisted if relevant, (4) is
the "API features" entitlement actually enabled — before assuming the token itself
is simply wrong.

## Official WordPress plugin is a separate namespace, not a source of catalog-API answers
LabelGrid publishes an official open-source WP plugin ("LabelGrid Tools", GPL, on
wordpress.org — safe to fetch/read as reference, same as reading API docs) that
talks to a DIFFERENT namespace, `/api/wpp/*` (WordPress-Plugin-specific: install
validation via `/api/wpp/me`, follow-to-download gate sessions, presave campaigns).
It never touches `/api/public/*`. Useful as an auth-scheme cross-check (confirmed
Bearer, confirmed 401/403="rejected"-vs-other="unreachable" is the right way to
triage a validation call) but NOT a source of ground truth for the general partner
catalog API's paths/shapes — don't extrapolate from `/api/wpp/*` behavior to
`/api/public/*` behavior, they are different backends with different token scopes.
Its source (`includes/class-labelgrid-tools.php`, `-http.php`) is a legitimate,
narrow diagnostic reference for confirming which namespace a token belongs to —
do not port its request-building logic into this project's own service code.

This distinction stopped being theoretical once a live token was tested against
both namespaces (see "Root cause found" above): it is the actual, confirmed
explanation for this project's specific 401s, not just a documented risk to avoid.

## A well-formed, unexpired, correctly-transmitted token can still 401: check its scopes
LabelGrid API tokens are RS256 JWTs (3 dot-separated base64url segments; decode the
middle segment as base64url JSON to inspect `exp`/`iat`/`scopes` — safe to do since
JWT security lives in the signature, not payload secrecy, though avoid printing raw
account/user identifiers unnecessarily). A real one seen from this account's own
dashboard carried `scopes: ["user.view-catalog", "user.gate-use"]` — these are
END-USER/fan-facing scopes (browsing a public catalog as a logged-in fan, using a
presave/follow-to-download gate), NOT content-provider/label/distributor scopes. A
token with only `user.*` scopes 401s on every content-provider endpoint (`/me`
included — even the simplest possible authenticated call) despite being genuinely
unexpired, unrevoked, and correctly sent. LabelGrid's token-creation page apparently
offers more than one scope/token-type; confirm which one is selected when
(re)generating — don't assume "the token I copied from my own account" is
automatically the right scope for content-provider API access. This is a distinct
failure mode from expiry/revocation/wrong-host/wrong-environment and should be
checked by decoding the JWT locally BEFORE escalating further, since it's instant
and free compared to more round-trips with the provider.

A companion token can also fail a more basic check: not even matching the JWT shape
(three dot-separated segments) that the account's other, genuine tokens have. A
single opaque segment with no dots is not a JWT at all and cannot be a currently-valid
LabelGrid API token if this account's real tokens are RS256 JWTs — likely a stale
placeholder or an unrelated credential, not merely an expired/wrong-scope real token.

## Full rewrite completed (Sep 2026) — every public method now honest
Every method in `labelgrid-service.ts` was reconciled against a full 14-file read of
LabelGrid's own official `@labelgrid/core` npm client source (account, catalog,
distribution, finance, insights, lg-content-types, lg-entities, lg-http, lg-upload,
reference, releases, resources, setup, webhooks) — the authoritative endpoint map,
superseding the OpenAPI-spec-only picture above. Two outcomes only: a method either
now calls a confirmed-real endpoint through `@labelgrid/core`'s `LabelGridClient`
(via a `cbCall()`/`callWithRetry()`/`unwrap()` pattern — the client returns
`{error}` ApiResults rather than throwing, so the circuit breaker needs an internal
throw/catch shim to still see failures), or it throws an unconditional, explicit
"not supported by LabelGrid's API" error. No method silently no-ops or fabricates
data anymore. Lesson for next time: this exhaustive per-file read is what makes it
safe to convert a guessed/broken endpoint to an honest throw instead of leaving a
live-but-wrong call — a partial read risks throwing on something that was actually
real, or worse, leaving a fictional path live because its real counterpart wasn't
found yet.

## No payout-request endpoint exists anywhere in the API
Confirmed via the full client-source read (not just the OpenAPI spec): LabelGrid has
no `/payouts` or withdrawal-request endpoint at all. Royalty payouts are dashboard-
only. `requestPayout()` is a permanent, unconditional throw — this is not a
follow-up item, there is no real endpoint to eventually wire up.

## Smart links are real; vanity slugs are not
`createSmartLink`/`getSmartLink` ARE backed by real endpoints — `POST
/releases/short-url` (idempotent, body is just `{release_id}`) + `PUT`/`GET
/releases/{id}/landing-config` — but the method is release-scoped, not scoped to an
arbitrary opaque `linkId` like the old fictional version assumed. There is no
custom/vanity-slug field anywhere in the real request shape; a caller passing
`customSlug` gets an explicit throw rather than having the option silently ignored.
`platforms` filtering is also not a real field — it's logged and ignored, since
silently dropping it without any signal would be worse. Zero live callers of either
method exist in the app today; this is forward-compatible plumbing, not something
currently exercised by product code.

## Analytics/royalty revenue figures have a structural artist-scoping gap
`GET /analytics/summary` supports an `artist_names` filter (real, name-based), but
`GET /royalties/breakdown` has NO artist filter at all — it's account-wide only.
This means `getArtistAnalytics()`'s revenue figure can never be artist-scoped no
matter how the method is written; only its stream count can be. This is a real API
limitation, not a bug to keep chasing. Likewise, neither analytics endpoint returns
a reliable per-outlet (Spotify/Apple/etc.) split, so `platforms: {}` is deliberately
always empty rather than fabricated — any caller reading `analytics.platforms[x]`
will always get `undefined` and must fall back to `analytics.totalStreams` /
`analytics.totalRevenue` (the account/release-level totals), never invent a
per-platform number.

## Publishing, sync licensing, and content-ID/claims were never real
`setPublishingMetadata`/`getPublishingMetadata`, `submitForSync`/
`getSyncOpportunities`/`updateSyncSubmission`, `getSmartLinkAnalytics`,
`createPreSaveCampaign`/`getPreSaveCampaign`/`getPreSaveSubscribers`, and
`submitContentClaim`/`getContentClaims`/`getContentRevenue` all have zero backing
anywhere in the 14-file client source or the toolset registry (`setup.ts`'s
`LABELGRID_TOOLSETS` only ever names account/reference/catalog/releases/insights/
finance/webhooks/distribution — publishing/sync/content-ID/presave toolsets never
existed). All converted to unconditional honest throws. Don't re-attempt these
without first confirming LabelGrid has actually shipped the feature (check
`setup.ts`'s toolset list again, since it's the single place new toolsets would
appear).

The live Stoplight docs (`api.labelgrid.com/docs/api`) list "Statements", "Royalties",
and "Transactions" as three SEPARATE top-level endpoint groups, not one blended
royalty concept. `getRoyaltySummary()` uses the account balance view (`GET
/account`), `getRoyaltyStatements()` uses `GET /statements` (paginated, filterable
by year via start_date/end_date) — confirm which of the three a given method
actually needs against the spec/client source before touching this area again.

## Release-level royalty sync now writes real data into royaltyTransactions (Sep 2026)
`server/services/labelGridRoyaltySync.ts` runs daily (05:00 UTC) plus once at boot,
gated on `isBgWorker`. For every release with `metadata.labelGridReleaseId` set, it
calls `getReleaseAnalytics()` and UPSERTs one `royaltyTransactions` row per
(releaseId, userId, platform="labelgrid", transactionType="streaming") — see
rolling-window-sync-upsert.md for why UPSERT-by-identity (not append) is required
here. Rows are `status: "pending"` (LabelGrid pays the label account, not each artist
directly — no real payout has occurred) and revenue is split across real
`royaltySplits` rows by percentage, falling back to 100% to the release owner.

This is release-level only, by design — it does NOT touch the account-wide
`getRoyaltySummary`/`getRoyaltyStatements` methods (structurally can't be split by
artist — see the artist-scoping-gap section above), which remain task #216's
territory. Any future work seeding/backfilling royalty rates (e.g. per-DSP streaming
rate tables) should be aware this writer already owns the `platform="labelgrid"` rows
in `royaltyTransactions` — don't create a second writer for the same identity tuple.

Gated on the existing public `labelGridService.isApiConfigured(): boolean` (already
used by `distribution.ts` in several places) so it never writes
`simulateGetReleaseAnalytics()`'s placeholder zeros into the ledger as if real — check
for an existing public accessor like this before assuming a private field (here,
`isConfigured`) needs a new one added to expose it.

As of this write-up, dev DB has zero releases with `labelGridReleaseId` set
(consistent with the known `LABELGRID_API_TOKEN` 401 from task #213) — the writer is
correct but has no real substrate to demonstrate against until that token/account
issue resolves.
