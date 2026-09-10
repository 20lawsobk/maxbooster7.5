---
name: Auto-discover chains catalog import
description: autoDiscover in artistProfileService.ts now runs release-catalog import as an awaited step for every platform newly confirmed that call, not as a separate manual flow.
---

## What changed and why

`ArtistProfileService.autoDiscover` previously only found and saved platform identity IDs (Spotify/Apple/Deezer/etc artist IDs). Importing an artist's actual release catalog into `distro_releases` required a separate, manual link -> scan -> import sequence via `distributionDataTransferService`.

Per explicit product decision, catalog import is now chained directly into `autoDiscover` as one of its main steps: for every platform in `savedFields` this call (i.e. newly confirmed, not already-linked) that has a real automated scanner — spotify, apple_music, deezer, audiomack — `autoDiscover` awaits `linkStreamingProfile` -> `scanReleasesFromProfile` -> `importProfileCatalog`, isolated per platform so one platform failing never fails the others or the overall call. Results are returned in a new `catalogImport: [{platformId, imported, failed, status}]` field on the auto-discover response, and the client surfaces the import counts in the discovery-complete toast.

**Why these four platforms only:** musicbrainz isn't a supported `linkStreamingProfile` platform id (would throw "Unsupported platform"). jiosaavn has no dedicated catalog scanner in `distributionDataTransferService` — it would just redundantly re-fetch the same iTunes catalog Apple already covers.

**Why it only fires on newly-saved fields:** re-running auto-discover on an already-fully-discovered profile has empty `savedFields` for platforms already linked, so it never re-triggers a redundant re-import — the same guard the existing claim-pipeline-init step already relied on.

**Gotcha already fixed once:** the profile URL passed into `linkStreamingProfile` is the REAL url the platform's own search API returned (e.g. Spotify's `externalUrls.spotify`, Apple's `artistLinkUrl`), not a hand-constructed URL — this guarantees it round-trips through `extractArtistIdFromUrl`'s regex correctly and stays a genuine, dereferenceable profile link. See the separate merge-path-crash memory entry for a bug this chaining exposed at scale in `importProfileCatalog` itself.

**Known pre-existing quirk, not fixed by this change:** Audiomack's confirmed match is saved into a profile field literally named `soundcloudArtistId` elsewhere in `autoDiscover` — a mislabeling bug, tracked as a separate follow-up, not touched by the catalog-import wiring.
