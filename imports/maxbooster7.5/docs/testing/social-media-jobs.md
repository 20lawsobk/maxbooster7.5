# Shared social video job status

`server/routes/socialMedia.ts` saves both `/generate-video` and
`/generate-music-video` jobs in PostgreSQL before returning a job ID. Any Node
worker connected to that database can poll the corresponding `/video-job/:jobId`
or `/music-video-job/:jobId` endpoint. The authenticated owner and job family
must match; another owner receives 404. The existing public response shapes are
preserved.

Apply `migrations/0098_social_media_jobs.sql` during the coordinated deployment,
before enabling these routes. It adds `social_media_jobs` and its indexes without
changing existing user records. Old process-local job IDs cannot be recovered
from a restart; they return 404 and require a new render.

Multipart scene validation runs after upload staging. Its missing-direction,
URL-direction, unsupported-platform, and missing-audio error branches now delete
all request uploads before returning 400. Valid requests retain their input files
until the renderer's existing final cleanup runs.

The render worker owns a 60-second database lease and refreshes it every 10
seconds. A heartbeat cannot renew an already expired lease. Terminal writes
require the original token, owner, family, processing status, and a valid lease;
only one racing completion can commit. A failed heartbeat stops renewal. Polling
an expired owned job records an explicit interruption and tells the user to
generate again. It never starts a second renderer automatically. A database
outage returns a retryable 503 from polling rather than pretending the job is
missing. Completed jobs require an asset URL and reject results larger than 1 MiB.

Each new admission removes at most 100 expired metadata rows older than seven
days, using `SKIP LOCKED` to avoid contending with another cleaner. Healthy
processing rows remain protected. This is metadata retention; it does not remove
the separately stored media assets.

Run the regression with Node 22 and PostgreSQL's `initdb`/`pg_ctl` on `PATH`:

```sh
node --test tests/social-media-jobs-postgres.test.mjs
```

The test starts an owned PostgreSQL server on a private Unix socket, applies the
actual migration twice, and exercises two repository instances plus the actual
exported polling handlers. It verifies completed-result readback, owner/family
isolation, unauthenticated access, heartbeat renewal and shutdown, interrupted
workers, stale/forged tokens, racing terminal commits, duplicate admissions,
result validation, bounded retention, and database-unavailable responses. It
also creates real owned temporary uploads and checks deletion on each invalid
scene branch, plus retention of valid renderer inputs. It
never uses the configured application database or calls a renderer/provider.
The master Node test group discovers this regression automatically.

This fixes shared job status, not shared rendering or blob storage. Production
must separately verify that every worker can read the durable asset URL. Upload
staging remains private to the worker running its render. MaxCore's own Python
job storage and the common PDIM blob authority remain separate deployment gates.
