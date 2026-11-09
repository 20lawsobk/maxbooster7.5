# MaxCore recovery and awareness verification — 2026-11-08/09

## Checkout and scope

- Base checkout: `review/pr-211` at `3b7d3be30dfb8e38076b226a602a062090a73a9d`.
- This is evidence for the current local working tree, not a production-release certification.
- No merge to `main`, production publish, provider delivery, or live payment was performed.

## Changes in this review

- Local PDIM AOF recovery now verifies frame checksums, ignores valid records already covered by the snapshot watermark, deduplicates identical post-watermark records, and still rejects conflicting duplicates or gaps.
- The local PDIM server acquires an exclusive filesystem lease before loading its shared snapshot/journal and requires ownership for writes, snapshots, and capsule operations. Startup failure and shutdown release the lease.
- MaxCore awareness now checks the configured public feed against same-origin `robots.txt` and an explicit terms-authorization gate before fetching. The configured YouTube Atom path is denied when robots disallows it; unknown terms are not treated as permission.
- Added protected admin source-status proxy/UI for the eight configured platforms. The UI distinguishes access-policy blockers from observations and training rights.
- Fixed the private-launch boundary blocking two required Vite development modules; only the exact shared policy module and exact dynamic-import helper are exempted in development, and both remain blocked in production. Corrected references to missing favicon files.
- Converted the PDIM expiry-tombstone test from a real-time wait to fake-clock advancement, preserving the expiry and replay assertions.

## Automated verification

- Python awareness tests: **81 passed**, covering public-access policy, source handling, platform discovery, and the awareness engine.
- Focused Node tests: **32 passed** across local PDIM AOF recovery and MaxCore proxy authorization.
- Authentication/governance tests: **4 passed**, including development-only Vite asset access and production denial.
- `npm run typecheck`: passed.
- `npm run build`: passed in 50.05 seconds. The build still reports a Studio bundle over 1 MB and existing dynamic-import chunk warnings.
- `git diff --check`: passed.
- The AOF recovery reproduction operated on a temporary copy; the source snapshot and journal were not altered by that fixture test.

## Running-system evidence

The configured `Start application` workflow was restarted three times after the recovery changes. Each start restored local disk state without the previous AOF sequence-discontinuity crash:

| Start | Snapshot entries restored | Durable mutations replayed |
| --- | ---: | ---: |
| First post-fix start | 910 | 78 |
| Second post-fix start | 918 | 55 |
| Third post-fix start | 921 | 13 |

After the third start, a stat-stable read of a temporary copy recovered 58 AOF records from snapshot watermark 813724 through sequence 813782; the original files were not modified. These checks establish local filesystem recovery only; they do **not** establish Replit App Storage bucket persistence, a backup restore, or production recovery.

At the final live probe:

- App `/`: **200**.
- App `/api/ready`: **503**, status `degraded`; database, Redis, route, audit, and automation probes were `ok`; MaxCore was degraded.
- App unified awareness readiness: `ready=true`, `snapshot_ready=true`, `source_scan_state=complete`, with 283 observation writes reported for the scan. This is an aggregate count, not a verified per-platform count.
- MaxCore `/api/health`: **200**, `model_loaded=false`.
- MaxCore `/api/ready`: **503**, `ready=false`, error `no_operationally_capable_certified_public_live_candidate`.
- Anonymous request to the admin source-status route: **403**, as expected.
- The Vite shared-policy module, Vite dynamic-import helper, and existing 32px favicon all returned **200**. The public landing page and `/login` rendered in browser previews; their console logs had no errors. No admin credentials were entered, so the authenticated dashboard and admin workflows remain unverified.

Startup logs contained transient MaxCore connection refusals before the Python server bound its port. On the second restart, initial database/PDIM requests also timed out/reset; later database and Redis probes recovered. MaxCore readiness did not recover.

The warm-start log reports a missing diffusion `vae.pt` checkpoint. No accepted, operationally capable serving model was loaded. Existing smoke candidate files do not constitute a certified serving model.

## Eight-platform source status

The configured platforms are Facebook, Instagram, X/Twitter, YouTube, TikTok, LinkedIn, Threads, and Google Business Profile. The current code has explicit, fail-closed access policies, but this work did not implement a native platform-wide web crawler or verify live source observations for any of the eight. The 283 aggregate awareness writes cannot be attributed to those platforms.

The current YouTube Atom path is blocked by the observed robots rule for that feed. Other platform sources remain unavailable, blocked, or unverified pending permitted access and terms review. No search-index metadata or third-party report is represented as a first-party platform observation. Public visibility does not grant model-training rights.

## Remaining release blockers

- No live, per-platform ingestion evidence or freshness/source-health matrix was verified; the native custom search/scraper redesign is incomplete.
- No actual new gradient-training run, accepted candidate, weight delta, or quality certification was established.
- No authenticated App Storage bucket checkpoint/history write, generation-pinned readback, or bucket recovery across restarts was performed. PDIM remains on its local filesystem-backed snapshot/AOF path.
- No authenticated admin journey or real text, image, audio, or video output E2E was verified. The image warm-start is blocked by the missing VAE; other modalities are not thereby proven usable.
- The deployment remains unpublished. These scoped checks do not certify the admin account or the full platform for production.
