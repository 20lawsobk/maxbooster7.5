# Node and cleartext transport finding resolution

Evidence is indexed against `sast-resumed-full.json` (58-finding array, zero-based
indices). No scanner rule was suppressed and no source was obscured to evade a
rule.

| Index | Resolution and exploitability evidence |
| --- | --- |
| 28 | **False positive (trusted loopback transport).** The only request destination is the source constant `http://127.0.0.1:1106`, used to ask the Replit Object Storage sidecar for a signed URL. It is neither remotely routable nor configurable, and no network peer can select it. HTTP is required by the platform-local sidecar contract; replacing it with public cleartext transport is not possible through input. |
| 29 | **False positive (trusted loopback transport).** `ReplitChunkStore` probes the literal IPv4 loopback endpoint `127.0.0.1:1106` before loading the Object Storage client. The URL has no input-derived component and carries no credential or application payload. |
| 30 | **False positive (trusted loopback transport).** `HybridStorageService.initialize` performs the same fixed loopback-only Object Storage availability probe with a 600 ms timeout. The request is not configurable and contains no sensitive payload. |
| 31 | **False positive (trusted loopback transport).** `ReplitStorageProvider.getClient` performs the fixed loopback-only availability probe. It cannot transmit off-host, contains no secret, and fails closed when the sidecar is absent. |
| 34 | **Remediated.** Poster subprocess selection is now a closed `ffmpeg`/`ffprobe` union with literal spawn branches, `shell: false`, a restricted inherited environment, control-character rejection, and absolute media input paths. All remaining arguments are fixed flags, numeric values, or service-generated absolute paths. A caller can no longer choose the command, inject an environment loader, or turn a relative filename into an option. |
| 37 | **Remediated.** Restore targets must now be canonical PostgreSQL URLs with a hostname. Control characters (including percent-encoded controls), URL fragments, libpq connection redirection, passfile/service indirection, `options` injection, and query-level `dbname`/`port` overrides (including percent-encoded parameter names) are rejected. Source and target isolation is checked against canonical effective host, default/explicit port, and decoded database identity, closing path, host-case/trailing-dot, encoded-name, and default-port aliases. `psql` remains an executable selected by the existing executable/version probe; it receives an argument array with `shell: false` and a restricted environment that drops `PGOPTIONS`, `PGSERVICE`, `NODE_OPTIONS`, and loader variables. The target is passed only as validated `PGDATABASE`. |
| 52 | **False positive (integration-test loopback).** The test intentionally talks to the real MaxCore child process bound to fixed `127.0.0.1:8091`. The port is a test constant, the request has no credentials, and loopback traffic cannot leave the host. Keeping the literal URL makes this trust boundary auditable. |
| 53 | **False positive (integration-test loopback).** The shutdown assertion probes the same fixed loopback test process at `/healthz` and expects connection failure. It sends no data or credentials. The literal remains visible rather than being suppressed or rewritten to evade static analysis. |

Focused regression coverage is in `tests/unit/subprocess-safety.test.ts`: it
checks argument/environment control-character rejection, environment
allowlisting, normal TLS PostgreSQL URLs, and rejection of libpq redirect and
option carriers. `npx vitest run --config vitest.config.ts
tests/unit/subprocess-safety.test.ts` passes 4 tests, including
`scratch?dbname=production`, percent-encoded `dbname`/`port` keys, decoded
database names, and equivalence of omitted versus explicit default port.