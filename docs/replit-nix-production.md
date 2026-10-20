# Max Booster: Nix-backed Replit workspace and release handoff

## Current source-of-truth and safety boundary

The repo includes `replit.nix` with PostgreSQL 17, xz, zstd, libarchive,
psmisc, Redis, fonts, and FFmpeg; Node 22 is pinned by `.nvmrc` and
`.node-version`. The live Replit workspace owns its `.replit` file and
runtime-specific language modules, port mapping, and deployment target.
`.replit` is deliberately ignored by Git because historical workspace
configurations have contained secrets. Do NOT commit, log, replace, or copy the
live `.replit` wholesale. Use Replit Secrets for credentials, not TOML.

The version-controlled `.replit.example` is **a safe starting template**, not
an instruction to overwrite the deployed workspace. Back up an existing
`.replit` inside Replit without exposing private values, then reconcile its
actual configuration with the template. Keep its established Nix channel,
language modules, run workflows, and deployment target where compatible.
On a *new, empty* workspace only, copy the template to `.replit` and review
the complete resulting configuration before running the project.

Replit's documented split of responsibilities is:
- `replit.nix`: system-level Nix dependencies, kept intentionally lean.
- `.replit`: entrypoint, Run/build commands, deployment, module and port settings.
- Replit Secrets: credentials, database URLs, provider secrets, and private tokens.

## Exact runtime contract

- **Node.js:** major version 22, installed through Replit's Node runtime module
  or a compatible Nix runtime; confirm `node --version` reports v22.
  Do not add a second large Node/Python/Rust toolchain to `replit.nix` without
  measuring the deployment image Nix closure against the 8-GiB layer limit.
- **Nix packages:** preserve `replit.nix`'s existing actual application deps.
  Heavy one-off compiler/tooling dependencies belong in disposable `nix-shell`
  commands, not the persistent closure.
- **Development command:** `npm run dev` (which runs
  `scripts/start-dev.sh` and the existing strict port contract).
- **Deployment build:** `DEPLOY_PACK=1 npm run build`. Capsule creation
  must happen in build, not based on a runtime-only deployment ID.
- **Deployment start:** `bash start.sh`, which locates a runnable Node 22,
  validates the application/sidecar port contract and restores required capsules.
- **Public app port:** `PORT=5000` locally, `externalPort=80`. Add exactly one
  public mapping. Redis, local PDIM, MaxCore, model services and other sidecars
  stay loopback/private and must not get an external public port.
- **Secrets:** configure at least the truly required variables identified by
  `.env.example` in Replit Secrets. No sample key/URL in the actual source
  configuration can substitute for an authorized production credential.

## Source reconciliation, without data loss

1. In Replit, confirm the current Git commit, dirty tracked/untracked state,
   attached volumes and backing storage, migrations, workflows and database
   targets. Avoid force-reset, replacing storage, and in-place database pushes.
2. Compare the *actual* Replit checkout with GitHub `main`, the reviewed
   integration PRs, and any Sophia branch; do not assume that a draft PR is merged.
3. Verify overlapping patches: PR #102 and #103 cover many of the same files;
   review them as alternatives / integration inputs, not two independent merges.
4. Bring across only reviewed, conflict-resolved changes on an isolated branch
   or clean disposable workspace. Preserve local data, runtime capsules, and
   `.replit` configuration. Make a reversible backup/commit first.
5. Run the dependency installation, Nix environment evaluation, server/client
   typechecks, unit/integration tests, security audit, production capsule
   build/restore, clean start, health/readiness/port probes and reversible
   recovery drills against isolated data. Do not certify checks that were
   skipped, timed out, or never executed.
6. Only promote after required release gates actually pass. User-controlled
   deployment/publishing and live provider/payment effects are separate.
   A green simulation alone is not a production-safety guarantee.

## Non-destructive validation

From the repository root:

```sh
node --test tests/replit-profile.contract.test.mjs
node --version
npm --version
nix-instantiate --eval --expr 'builtins.length ((import ./replit.nix { pkgs = import <nixpkgs> {}; }).deps)'
npm run check
npm run test:runtime-contracts
npm run test:ci
npm run security:audit
DEPLOY_PACK=1 npm run build
```

The last commands require full source dependencies, memory and isolated backing
services; the provided standalone contract test does not claim they ran.
Inside the actual Replit workspace, additionally execute `npm run check:ports`
if present (or `npm run check:ports` in the tracked package manifest) and
exercise `bash start.sh` only after a valid build and safe service isolation.

## Known production gating issues (2026-10-20)

- The GitHub tree on `main` has **7,429 files** and `.replit` is intentionally
  ignored. A clean GitHub checkout alone is not a configured Replit VM.
- Integration PR #102 and #103 overlap; their descriptions explicitly report
  outstanding full tests, Replit divergence, PDIM lease conflict and an API 502.
- Recent release-gate/model/email/UI hardening patches are on *draft* PRs,
  not automatically present in `main`.
- Do not treat GitHub Actions jobs with zero executed steps, Vercel failures,
  historical scaled-simulation reports, or unverified provider responses as GO.
- Live Sophia Agents API execution requires `OPENAI_API_KEY` in a supported
  terminal and an authorized saved GitHub MCP connection; the ChatGPT plugin
  package alone does not start a session.

Official Replit guidance:
https://docs.replit.com/references/project-setup/configuration
https://docs.replit.com/references/project-setup/dependency-management
