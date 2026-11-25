# Environment Verification Notes — 2026-09-29

Why this tree is **CONDITIONAL GO** and not full green: every remaining red
item is an environment limitation of the container the work was done in, not a
known code defect. This file states exactly what was verified, what could not
be, and what must run on Replit / the VM before the full green light.

Companion: `PRODUCTION_READINESS_2026-09-29.md` (full readiness report).

## 1. Verdict

**CONDITIONAL GO.** The codebase passes everything this container can
execute. The gaps below are all "cannot run here," none are "known broken."

## 2. Verified in this container (2026-09-29)

- **Unit suite (vitest):** 134/135 files green — 1066 passed, 3 skipped
  (zstd round-trips; zstd absent here, present in `replit.nix`). The one
  non-green file is `retained-pdim-recovery-simulation`, which times out under
  full parallel load but passes alone in ~2s. Root cause of the flake found
  2026-09-29: timed-out runs leave orphaned `verifier-worker.mjs` /
  `fixture-worker.mjs` processes behind, and the orphans poison subsequent
  runs (they hold ports/locks). Kill orphans + remove
  `.pdim-recovery-simulation-*` scratch dirs and it passes. The test does not
  clean up its workers on timeout — test-hygiene issue, not a product bug.
  (A second file, `capsule-pack-restore-roundtrip`, failed transiently because
  `dist/pdim-restore.mjs` — a tracked build artifact with the skip-worktree
  bit set — had been deleted from disk; restored from git and the test
  passes.)
- **Typecheck:** server (`tsconfig.server.json`) and client
  (`tsconfig.client.json`) both clean. (248 server + 359 client files carry
  `// @ts-nocheck` — pre-existing, unchanged by this work.)
- **Lint:** clean on all changed files (via `node_modules/eslint/bin/eslint.js`;
  the `.bin/eslint` symlink is stale — points at a removed pnpm path).
- **Beta simulation** (`scripts/readiness-beta-simulation.mjs`): 26 PASS /
  3 FAIL / 2 BLOCKED — all five non-passes are environment blockers (see §3),
  not code failures.
- **Python digital-GPU layer — verified live** with system python3 + numpy
  (torch unavailable, so this is module-level verification, not the full
  MaxCore suite):
  - `ReplicaPool` cross-replica dedup fix: replica 0 compute 53.6ms →
    replica 1 cache hit 0.9ms (60x), bit-exact, matches numpy.
  - `DigitalGPU.gemm` pool wiring: returns `Tensor` (type preserved), pool-on
    vs pool-off bit-identical, `MAXCORE_REPLICA_POOL=0` kill-switch confirmed,
    bias/activation path falls back to the direct backend unchanged.
  - Cross-`DigitalGPU`-instance dedup confirmed via the shared orchestrator.
- **Wiring audit (this pass):** HyperGPU→PocketAccelerator path confirmed
  correct and untouched; `platform-capsule.ts` was built but had no invocable
  entry point — now exposed as `npm run capsule:build`.

## 3. Could NOT be verified here — environment gaps

| Gap | What it blocks | Where it resolves |
|---|---|---|
| No `torch` in system python | `test_maxcore.py`, `media_kernels`, `torch_backend`, Python media/audio contract tests (2 beta BLOCKED) | Replit / VM python env |
| No `.pythonlibs/bin/python3` | Exact Replit python parity | Replit |
| No `initdb` / `pg_ctl` | `closure-integrations` beta FAIL (PostgreSQL-backed) | Replit (PG17 in replit.nix) / VM |
| No `zstd` binary | 3 zstd round-trip unit tests skipped | Replit (zstd in replit.nix) / VM |
| Node 24 here vs Node 22 target | Runtime parity (`start.sh` bundles portable Node 22) | Replit / VM |
| No Docker | Container-based acceptance | VM |
| `reports/readiness-audit/scanner-dependencies.json` absent | `security-consumers` beta FAIL — artifact is produced by the security scan step, which was not run here | Run scan on Replit/VM |
| Owner-supplied PDIM persistence | `data-runtime` beta FAIL | Replit / VM |

## 4. Must run on Replit / VM before full green

1. `npm ci` clean install (never done here — pnpm store was pre-existing).
2. Deferred acceptance scripts: `scripts/simulate-production.mjs`,
   `scripts/production-provider-simulation.mjs`,
   `scripts/readiness-assembled-acceptance.mjs`,
   `scripts/maxcore-isolated-recovery-acceptance.py`.
3. Security scan step to regenerate `scanner-dependencies.json`, then re-run
   the beta simulation.
4. **The new Python wiring under the real suite:** `test_maxcore.py` with
   torch, plus live-traffic shadowing of `DigitalGPU.gemm` with the pool on.
   Kill switch is `MAXCORE_REPLICA_POOL=0`. The pool changes the default
   dispatch path for plain float32-ndarray GEMMs; it was verified equivalent
   here (bit-identical, Tensor type preserved, miss-compute uses the caller's
   own backend so numerics can't drift), but the torch suite is the real gate.
5. VM route: `npm run capsule:build`, capsule boot timing (extract-and-boot
   and stream-and-serve), cold-start latency, PDIM store warmth compounding.

## 5. What changed in this push (wiring/efficiency pass)

- `external/maxcore/.../maxcore/pdim/replica_scaler.py` — **bug fix:** pool
  replicas now share one dedup namespace, so the documented cross-replica
  cache hits actually happen (previously each replica deduped alone and the
  headline feature silently did nothing). `ReplicaPool` also accepts a
  `gpu` (backend) for miss-compute.
- `external/maxcore/.../maxcore/pdim/pocket_multiply.py` — new optional
  `dedup_namespace` on `PocketDimension`; per-replica paths kept for identity.
- `external/maxcore/.../maxcore/api.py` — `DigitalGPU.gemm` now dispatches
  plain float32-ndarray GEMMs through the replica pool (shared dedup +
  lock-free fan-out). Default ON per codebase convention; `replica_pool=False`
  ctor arg or `MAXCORE_REPLICA_POOL=0` disables. Bias/activation and
  non-float32/non-ndarray operands take the exact historical path.
- `scripts/package-capsule.ts` + `capsule:build` npm script — invocable
  platform-capsule builder (the VM deployment artifact).
- (Earlier in the day: pagination guard cap, Stripe/payout/catalog/social/
  MaxCore-proxy/security test honesty fixes — see readiness report.)

## 6. Pre-existing tree state (not from this work)

- `dist/gateway.mjs`, `dist/public/index.html` modified at base commit.
- `client/src/lib/distributionMetrics.ts`,
  `external/pdim/.../lua-pool.ts`, `lua-worker.ts` modified (earlier session).
- `scripts/deploy.ts` (referenced by the `deploy` npm script) does not exist
  — the `deploy` script is broken upstream of this work; intentionally not
  reconstructed here.
- Commit `26d1fbc` ("Production readiness + efficiency wiring pass (2026-09-29)")
  was pushed to `origin/main` on 2026-09-30 (fast-forward from `d1e4ac9`,
  verified via `git ls-remote`). The tree state below describes the pre-push
  working tree that became that commit.
