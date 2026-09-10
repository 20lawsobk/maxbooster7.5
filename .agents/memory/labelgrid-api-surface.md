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

## Still broken (follow-up work, not fixed in this pass)
~25 other methods (releases, ISRC/UPC, smart links, presave, payouts, royalty
statements, sync licensing, DSP catalog import) still use the old broken paths/shapes.
Only `searchArtistAcrossPlatforms`, `getArtistPlatformPresence`, and the now-honest-
no-op `getArtistCatalog` were fixed and verified end-to-end this pass. See project
tasks for the follow-on fix and the missing webhook-receiver gap.
