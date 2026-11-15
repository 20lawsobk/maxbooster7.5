# Production simulation — interrupted after build artifacts

## Status

The bounded isolated run reached the real compile and capsule-pack phases, then
the outer execution window terminated before the build preflight returned.
`bash start.sh` was **not run**, so this report makes no deployment or startup
success claim.

- Build command: `DEPLOY_PACK=1 npm run build`
- Build copy: `/tmp/max-booster-production-simulation-9mxBPE/app`
- Frontend Vite compile: passed (18.91s)
- Server esbuild: passed (`dist/index.mjs`)
- Cluster esbuild: passed (`dist/cluster.mjs`)
- `node_modules.pdim`: produced (152,692,834 bytes)
- `app_remainder.pdim`: produced (6,297,474 bytes)
- Start command: not run
- Liveness: not measured
- Readiness: not measured

The source workspace was not the build cwd and was not mutated. The disposable
copy excluded `.replit`, `.git`, data/logs/user media, workspace caches/state,
credentials, and the external service trees. Because `external/` was excluded,
MaxCore/PDIM background capsule restoration was intentionally outside this
simulation's scope.

## Harness corrections

The earlier Sentry resolution failure was a harness false positive: an
unanchored `*.log` tar exclusion matched
`node_modules/@sentry/core/build/esm/logs`. The reusable runner now anchors
workspace-only exclusions, removes the generic `*.pem` exclusion (preserving
dependency CA certificates), excludes only `dns-node/keys`, prevents Python
package-index access with `PIP_NO_INDEX=1`, and verifies required Node,
Python, and certifi copy inputs before building.

Node v24 was resolved through the isolated allowlisted PATH. The copy had no
`.node_bin/node`; `build.ts` does not provision that bundle. The current VM
therefore supports `start.sh`, while a target image without PATH Node would
require a production configuration fix.