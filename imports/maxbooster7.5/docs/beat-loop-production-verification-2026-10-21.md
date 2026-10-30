# Beat Money Loop verification — 21 October 2026

The loop now sends musical direction and the canonical fresh public-awareness
receipt to MaxCore audio and artwork generation. Audio submission, job polling
and retrieval retain the configured administrator's identity. Obsolete dataset
mode flags and duplicate mode retries were removed.

Before publication, audio must decode, meet the requested duration and pass a
measured silence check. The separately encoded preview must be shorter than
the paid source. Audio, preview and cover uploads are read back before listing.
Only the decoded cover is published through the image-only storefront route;
the full beat retains owner/admin/completed-buyer access. Listing, source beat
and 100% producer royalty ownership are committed in one database transaction;
failed listing writes roll back rows and remove audio/public uploads.

Singleton initialization tolerates concurrent workers. A PostgreSQL advisory
lock prevents overlapping cycles across replicas and protects active cycles
from another replica's restart recovery. Pausing clears queued cycles and a
finishing manual cycle cannot reschedule a paused loop. Failed lock releases
discard the connection. Administrative generation preferences are validated
before accepting a background run.

Nine lifecycle scenarios pass using real disposable PostgreSQL, transactions,
FFmpeg decoding, preview extraction and measured audio levels. Renderer,
object storage and social-provider ports use explicit fixtures:

- Concurrent initialization produces one paused state row.
- Real orchestration produces decoded audio, a shorter preview, awareness-bound
  cover art, a listing and its royalty owner.
- A replica cannot run or orphan a cycle while another connection holds its lock.
- Pending/unsettled orders do not mark sold. Completed marketplace settlements
  do; repeated observations do not duplicate earnings and refunds reduce them.
- A provider result with zero posts is reported as unposted.
- Concurrent manual requests cannot overlap; pause clears queued work.
- A rejected listing rolls back beat/royalty rows and removes public/audio uploads.
- Silent audio is rejected without relying on renderer-supplied quality metadata.
- An unavailable renderer creates no listing and records failure/backoff.

Run `npm run test:beat-loop` with PostgreSQL executables on PATH. The runner
creates its own socket-only database and receives no application credentials.
Additional unit tests cover owner propagation, terminal jobs, corrupt WAVs,
preview access and observation-based pricing. Existing offline commerce tests
verify production settlement handlers independently of provider delivery.

This verifies internal orchestration, not autonomous revenue in production.
The live text capability check still reports no operational candidate, which
also blocks learned audio and campaign captions. No live loop was enabled,
public post dispatched or real sale manufactured for this verification.
Connected publishing accounts, deployed signed payment webhooks, capable
renderers and real buyer activity remain necessary for a working revenue loop.
