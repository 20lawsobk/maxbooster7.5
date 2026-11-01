# Recovery access diagnosis

## Superseding authority correction

The owner confirms there is no external PDIM server: PDIM is local and its
credentials are created by the local server. The remote probes below are
historical observations against obsolete configuration. They are not a current
production blocker, and requesting replacement remote credentials was incorrect.
Do not act on the historical external-token remediation instructions below.

Current startup imports `pdimEnvFix` and calls `startLocalPdimServer` from
`server/index.ts`. `server/lib/localPdimServer.ts` binds the exec service to
loopback and checkpoints its map to `data/local-pdim-store.json` every 30 seconds
and on SIGTERM. This is an actual local bootstrap, not merely a vendored server
that would need remote provisioning.

Local restart recovery and restoration after loss of the instance/backing files
are distinct guarantees. The remaining backup gate is to verify the actual
local PDIM persistence/export/restore path and a database restore to an isolated
target. Neither obsolete remote 403 responses nor successful local PINGs prove
or disprove those recovery guarantees. No recovery drill is claimed by this
correction.

## Historical probe record (superseded as current requirements)

Observed at **2026-09-22T09:15:06Z**. This diagnosis is intentionally
read-only and sanitized.

## Conclusion

The configured HTTP 403 is an **application authentication denial**, not a
DNS, TLS, protocol, redirect, or generic platform/network denial.

All three configured URL names resolve to one identical HTTPS exec URL with
the expected `/api/redis/instances/{instance}/exec` shape. There are two
distinct configured credential groups: the storage credential and one shared
by all three PDIM credential names. A bounded `POST` PING using each credential
reached the same endpoint and, for both, returned:

- HTTP 403 without a redirect;
- JSON, not an HTML proxy/error page;
- the same small response shape (`error` and `message`);
- a token-related denial marker; and
- no observed edge/platform marker.

The response bodies, URL, instance identifier, host, and credentials were not
printed or retained in this report. The matching token-denial responses show
that the request reached an application handler at the expected route. They
also show that neither configured credential is currently accepted. The
evidence does **not** distinguish credential revocation/rotation from a
still-running but no-longer-authoritative instance, so neither should be
claimed without control-plane confirmation.

## Authority and route findings

The storage-internalization record and current source materially change the
meaning of these old external settings:

- PDIM is now intended to be an internal subsystem.
- Unless `PDIM_FORCE_REMOTE=1`, `server/lib/pdimEnvFix.ts` rewrites all PDIM
  and storage exec URLs to the loopback internal PDIM route before clients
  initialize.
- `PDIM_FORCE_REMOTE` is not configured in the inspected production
  environment.

Therefore the configured external URL is no longer the normal application's
authoritative live storage route, even though a service still answers at that
address. It must not be treated as a recovery destination merely because it
remains configured.

No independently recoverable, current off-source route was found:

- `databaseBackupService` still writes through `storageService`.
- `storageService` explicitly uses PDIM as its sole backend.
- The available backup interface also records source-catalog state, so it is
  not a catalog-independent bootstrap export.
- A Replit bucket identifier is present, but the database backup path is not
  wired to it. Configuration presence alone is not recovery evidence, and no
  bucket operation was attempted.
- The loopback PDIM route is an application subsystem, not an independent
  off-source recovery destination.

## Evidence classification

| Candidate cause | Classification | Evidence |
|---|---|---|
| Wrong protocol | Ruled against | The HTTPS connection completed and returned endpoint JSON. |
| Wrong path/request shape | Ruled against | The path matches the current exec-client contract and the handler returned a token-related JSON denial to a correctly shaped PING. |
| Platform/network denial | Ruled against for these probes | DNS/TLS/HTTP completed, there was no redirect or HTML/edge denial marker, and the response was endpoint JSON. |
| Application authorization policy | Not positively established | The denial is token-related; no evidence identified an authenticated principal rejected by a later permission policy. |
| Application authentication | Established | Both configured credential groups received the same HTTP 403 token-related denial. |
| Obsolete/non-authoritative external route | Established for application routing; historical instance status unresolved | Current startup code repoints to internal loopback and remote mode is not enabled. The answering external instance may be stale or separately owned. |
| Independent current recovery route | Not found | No backup path independent of PDIM/source catalog was identified. |

## Required action

Keep live DDL and backup-completion claims blocked. The next operator action is
to establish one authoritative, durable off-source recovery destination,
independent of the source database and internal PDIM process. Either:

1. obtain control-plane confirmation of the intended external recovery
   instance and rotate/provision an accepted credential for that exact
   instance; or
2. wire the backup service to an approved independent object-storage target
   with retention and access controls.

Do not revive an old external URL solely by changing credentials, and do not
assume the configured Replit bucket is suitable until ownership, durability,
retention, and restore access are verified. After an authoritative destination
is selected, first repeat only a bounded authenticated health/PING check. Then,
under separate authorization, prove a checksummed backup and isolated restore
with application invariants before any live migration.

## Safety record

The work performed only environment metadata inspection and bounded read-only
PING requests. No environment value was changed; no response body or
credential was disclosed; and no dump, storage write/list/delete, database
query/write, restore, migration, application/sidecar startup, package install,
publication, or workflow operation was performed.