# Public awareness to canonical PDIM acceptance

The final October 27 run **passed** in 5.376 seconds. It executed the four existing
public source adapters, the actual local canonical PDIM owner and its Lua/AOF
publication contract, and a fresh awareness-engine follower. No trained model,
application database, generation engine, background ingestion/learning loop,
external publisher or paid provider was started.

The actual observations were Apple 50, Guardian culture 26, Marketing Dive 10 and
Mastodon 19. Four feed adapters required six HTTPS GET hops: Apple redirected
once to `rss.marketingtools.apple.com`; Guardian redirected once on the same
host. The existing production transport validated public addresses on every hop,
pinned the connection, retained TLS verification, used the configured proxy/CA,
and enforced its normal maximum of three redirects. Its public DNS validation
traffic is separate from those six content requests.

## What the run proves

- The disposable canonical store started empty, admitted the actual fenced
  ingestion lease, persisted validated source ledgers, and atomically published
  the actual immutable snapshot blob and matching current pointer.
- Every mandatory domain contained fresh observations. Source ledgers had
  positive bounded TTLs; snapshot schema, content identity and expiration checks
  passed. An explicitly expired copy was rejected by the real validator.
- A separate `Engine` loaded the published snapshot through actual PDIM without
  fetching again. Its awareness status was ready, with no scheduler or ingestion
  ownership. Its untrusted-data conditioning contained the same snapshot ID and
  actual observation IDs from all four domains.
- The owner exited zero. Its process group had no active processes afterward;
  a defunct esbuild child in state `Z` was recorded separately. The private
  temporary PDIM directory was removed, and inspected source hashes remained
  unchanged throughout execution.

Reports contain counts, record IDs, metric names, timestamps, digests and HTTP
host/status metadata. They do not retain feed bodies, observation text or the
fresh local-channel token. Scratch persistence files were hashed before removal.

## Run it again

Requirements: Node with the repository dependencies/tsx installed, Python with
the MaxCore NumPy/runtime dependencies, and the configured outbound proxy and
verified CA trust needed by the existing safe public reader. Use an empty output
directory; the driver refuses to overwrite prior evidence.

```sh
python -B reports/live-awareness-acceptance/2026-10-27/canonical-public-pipeline.py \
  --node /path/to/node \
  --output /tmp/maxbooster-public-canonical-run
```

The driver removes inherited application/provider configuration before importing
repository modules. It passes only tool/library settings to the Node owner and
adds a generated private loopback token for this run. Public HTTP retains only
the selected proxy/CA settings. `concurrency=1` bounds source refresh work.

The saved final command used `/workspace/.cloud-python/bin/python` and Node
22.23.3 at `/workspace/.cloud-tools/node_modules/.bin/node`. Python was 3.12.14.
The exact commands, environment **names**, inputs and output hashes appear in
the [final receipt](canonical-public-pipeline-final/receipt.json).

## Preserved attempts and limits

1. [Initial failure](canonical-public-pipeline/receipt.json): the acceptance
   driver incorrectly imposed zero redirects, preventing Apple and Guardian
   reads. The production transport permits validated bounded redirects. The
   actual engine refused to publish with missing domains. Its exact driver is
   retained as `canonical-public-pipeline-attempt-1.py`.
2. [Transport-audit failure](canonical-public-pipeline-production-transport/receipt.json):
   all four final content responses were HTTP 200, but the acceptance wrapper
   accessed `FetchResult.url` instead of its declared `final_url` field. That
   harness-only exception prevented rows from reaching the engine. Its driver
   is retained as `canonical-public-pipeline-attempt-2.py`.
3. A separately labeled pure-local schema/interface preflight then passed. It is
   not public acceptance. The corrected final driver executed fresh live reads
   and passed the actual canonical publication/follower checks above.

This run does **not** prove the main Node generation consumer, planner/media
output, deployed Replit startup, provider delivery, semantic generation quality,
peak-content learning across all domains or global capacity. Awareness readiness
is independent of trained-model availability. The separate server `/ready`
contract in `server.py` also requires `_model_ready`; no full application
readiness or checkpoint inference is claimed by this receipt.
