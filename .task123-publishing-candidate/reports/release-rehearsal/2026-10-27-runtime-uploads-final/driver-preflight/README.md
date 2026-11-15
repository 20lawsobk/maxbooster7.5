# Serialized cold-release driver preflight

This is a driver-control-flow review, not a prepared release, cold startup or launch certificate. The versioned directory was reserved on October 27; receipts record their actual UTC execution time.

The driver retains the existing `npm run release:prepare`, `npm run release:verify`, copied-payload `scripts/readiness-packed-acceptance.mjs` and final verification sequence. It selects `RELEASE_CAPSULE_THREADS=4`, preserves the historical zstd level 19 and existing policy/source/checksum cache gates, forwards only approved proxy/CA tool settings and live-awareness public build configuration, and supplies no application/provider/database secrets. The actual cold runner receives the common credential-clean environment.

The source-input inventory and full release-admitted inventory have distinct scopes. Both are captured before execution and after any returned command failure or handled driver exception. The latter includes ignored admitted build inputs that the code-only inventory omits. A missing initial observation is labeled unavailable; it is never replaced with an old manifest or interpreted as an empty inventory. Expected preparation failures retain their real exit status, and neither observation failures nor drift can produce a pass.

Four isolated, synthetic probes execute the actual driver with mocked command and observation boundaries: a returned preparation exit 17, an unexpected preparation `OSError`, a failed initial admitted inventory, and a failed initial code inventory. All four retain an after observation, fail honestly and preserve either a complete exact diff or an explicitly unavailable comparison. No preparation, network call, cold runtime or source mutation executes during these probes. `summary.json` binds their result to the driver hash; each raw child output is retained.

The packaging isolation cohort's 36 manifest members verify against their hashes and sizes, and all four current packaging implementation/test hashes still match its 14-pass receipt. Its two Python test hashes are historical because later assertion-oracle corrections followed that cohort; the final all-five oracle receipt separately binds those later test sources.

The actual release must run only after the final stable-source master completes and the owner of this execution issues GO. No native build, master load profile, source edit or admitted build-output mutation may overlap preparation. The preparer still performs its own independent source/policy/dependency guards and may reject capacity, invalid cache entries or source drift. This local portable-payload check cannot certify Replit Nix/image measurements, a published HTTPS deployment, providers, globally scaled capacity or every desktop client.

Run the prepared driver from the repository root with Node 22 and the documented PostgreSQL/Rust/library tool selectors:

```sh
python3 reports/release-rehearsal/2026-10-27-runtime-uploads-final/execution-driver.py
```

It refuses an output directory already containing `summary.json`. For a later attempt, pass a new output directory as its sole argument. Preserve all prior attempts. The outer caller must retain and track its owned execution process until completion; forcibly terminating the driver is not itself proof of descendant cleanup. The existing command helper bounds normal command timeouts, and the cold runner records its owned-descendant cleanup separately.
