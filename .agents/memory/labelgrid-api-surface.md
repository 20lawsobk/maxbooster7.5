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

## Still broken (follow-up work, not fixed in this pass)
~25 other methods (releases, ISRC/UPC, smart links, presave, payouts, royalty
statements, sync licensing, DSP catalog import) still use the old broken paths/shapes.
Only `searchArtistAcrossPlatforms`, `getArtistPlatformPresence`, and the now-honest-
no-op `getArtistCatalog` were fixed and verified end-to-end this pass. See project
tasks for the follow-on fix and the missing webhook-receiver gap.
