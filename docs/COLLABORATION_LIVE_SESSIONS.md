# Live collaboration sessions

## Current application behavior

- A live session is bound to one project and a monotonically increasing room
  generation. Closing a room invalidates its WebSocket participants; reopening
  it creates a new generation.
- Shared notes use room-and-generation-specific fields in the existing project
  Yjs document and persistence service. WebSocket updates are accepted only
  while current project read/write access remains valid.
- Room chat is stored in PostgreSQL with a per-sender idempotency key. Redis/
  PDIM Pub/Sub distributes saved messages to connected app processes; delivery
  failures return an explicit error while preserving the stored message.
- Room reads, writes, signaling, and active sockets recheck project access.
  The WebSocket layer also revalidates the authenticated session and room
  generation while the connection remains open.
- Audio/video uses the WebRTC standards implemented by a self-managed mediasoup
  SFU. The app does not use a mesh-only call path. The server currently supports
  Opus audio and VP8/H.264 video producers, transport setup, consumption,
  participant presence, mute/camera state, and manual/automatic reconnection.
- Media is disabled unless a regional SFU, TURN relay, public address, and
  matching recent capacity evidence are configured. No test fixture is accepted
  as deployment evidence.

## Required schema migration

`migrations/0101_collaboration_rooms.sql` creates the durable room and message
tables. It was applied and verified against the configured application database
for this workspace. At that time, `NEON_PRIMARY_URL` and `NEON_DATABASE_URL`
resolved to the same connection string, so this run did not prove a second,
independent Neon database was migrated. Apply and verify the migration against
each distinct target before enabling sessions in another environment.

## Regional media configuration

The following environment settings are all required before the media worker
will start:

| Setting | Purpose |
| --- | --- |
| `COLLABORATION_MEDIA_ENABLED=true` | Explicitly enables the SFU. |
| `COLLABORATION_MEDIA_REGION` | Stable region identifier for this SFU. |
| `COLLABORATION_MEDIA_LISTEN_IP` | Interface address used by the worker. |
| `COLLABORATION_MEDIA_ANNOUNCED_ADDRESS` | Public IP or hostname advertised in ICE candidates. |
| `COLLABORATION_MEDIA_RTP_MIN_PORT` / `COLLABORATION_MEDIA_RTP_MAX_PORT` | UDP/TCP media port range; at least 100 ports are required. |
| `COLLABORATION_TURN_URLS` | Comma-separated `turn:` or `turns:` URLs. |
| `COLLABORATION_TURN_SHARED_SECRET` | Coturn REST authentication secret; never log or expose it. |
| `COLLABORATION_MEDIA_CAPACITY_REPORT` | Path under `reports/collaboration-media/` to a recent region-specific capacity report. |
| `COLLABORATION_MEDIA_CAPACITY_REPORT_SHA256` | SHA-256 digest of the exact report file. |

The report must contain `schemaVersion: 1`, the configured region,
`maxParticipants`, `testedParticipants`, a unique `testRunId`, an ISO-8601
`measuredAt`, `durationSeconds`, `loadTestPassed: true`, and
`turnRelayVerified: true`. The advertised participant limit cannot exceed the
tested participant count. The run must last at least five minutes and be no
older than 90 days. The digest is checked at runtime. Create a report only from
an actual load and relay test; the schema alone is not evidence that the test
occurred.

The media UDP/TCP range and TURN listener must be reachable from participant
networks. An HTTP health response does not prove that media packets or relay
allocations work. A Replit preview without exposed/configured media ports
therefore remains unavailable even if the web app is healthy.

## Region assignment and current limits

When the first participant joins, the room records the region serving its SFU.
Subsequent callers are rejected if they arrive at a different region rather
than silently creating a second isolated call. The application's DNS/GeoDNS
can discover application endpoints, but DNS discovery does not prove a media
region is healthy, measured, or able to carry a call.

This code does not yet provide cross-region SFU piping, room-to-region endpoint
redirection, a distributed participant admission lease, or multi-instance
SFU ownership. A room is therefore limited to one configured media process and
region. Do not advertise worldwide or horizontally scaled calls until those
paths are implemented and measured. The capacity report's limit is a hard
admission limit within that process, not a guarantee of capacity across
multiple replicas.

## Operational lifecycle

The SFU worker is prepared only when media is explicitly enabled and its
configuration/evidence passes validation. The app reports the media service as
unavailable when configuration, report integrity, freshness, worker health, or
region assignment fails. Shutdown closes routers, transports, and the native
worker before the database pool is closed.

## Verification boundaries

The automated local test starts the native worker, creates a router, and binds a
WebRTC transport using an isolated synthetic fixture. This verifies the
installed worker/API wiring only. It does not measure call capacity, test a
real TURN relay, validate cross-region routing, or authorize a production
participant limit. Those require provisioned regional endpoints, reachable
media ports, and a separately recorded real network/load test.
