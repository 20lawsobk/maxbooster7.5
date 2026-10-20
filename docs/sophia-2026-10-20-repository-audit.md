# Max Booster — source inventory and release blocker assessment (2026-10-20)

## Scope and evidence limitations
Source repository: `20lawsobk/maxbooster7.5`, inspected at main
`5a17a90878a5c05b4d09a9793d1393090f86af53`.
The recursive GitHub tree was **not truncated**: **7,429 tracked blobs**.
This report is a repository-tree inventory plus a focused review of key
release scripts, Replit/Nix files, CI, and open PR metadata. It is **not**
a claim that every source line, execution path, branch, or commit was manually
reviewed, nor that every compiled or provider-backed path was tested.
No live Sophia API session ran: `OPENAI_API_KEY` was not available to the runner.

## Size and subsystem inventory

| Path prefix | Tracked blobs |
|---|---:|
| `reports/` | 1,934 |
| `external/` | 1,009 |
| `client/` | 977 |
| `server/` | 885 |
| `.pdim-scratch-external_maxcore-989/` | 613 |
| `built-in plugins dsp/` | 429 |
| `tests/` | 361 |
| `.agents/` | 248 |
| `dist/` | 159 |
| `scripts/` | 143 |

The tree enumerated approximately 562.7 MB of blob sizes (not a clone-size,
image-size, or deploy-closure measurement). The GitHub repository metadata
reported a size of 1,184,748 KB; these measure different things. Tracked
snapshots, build outputs and scratch trees require an audited retention policy.
**Do not mass-delete** them without checking restore references, Git history,
recoverability and production dependencies.

## Existing Nix/Replit configuration

- `replit.nix` exists on main and defines PostgreSQL 17, xz, zstd,
  libarchive, psmisc, Redis, nano, DejaVu fonts and FFmpeg. It has intentionally
  not been expanded because Nix inputs affect the deployment image closure.
- Node 22 is pinned in `.nvmrc` and `.node-version`.
- `.replit` is **not tracked** and is intentionally ignored by `.gitignore`;
  original live Replit configuration may contain secret material.
- `scripts/start-dev.sh`, `scripts/check-port-contract.ts`, and production
  `start.sh` require local port 5000 -> external port 80 and private sidecars.
- Canonical production build is `DEPLOY_PACK=1 npm run build`;
  canonical VM start is `bash start.sh`. Runtime providers and actual
  credentials remain outside this GitHub change.
- This branch adds `.replit.example` and standalone contracts; these are
  safe inputs for **reconciling**, not overwriting, the live workspace.

## Branch and pull-request review priorities

- GitHub branch discovery returned at least **64 branches** with a terminal
  cursor after the extra page. These include main/master, replit-agent,
  Sophia, Codex, race/page, Copilot, Dependabot and Vercel families.
- The open PR inventory initially had **18** before this new configuration
  PR #105 was opened; opening it raises the count.
- Draft PR #102 reports **53 changed files** and combines page, CI, payment,
  model and automation hardening; draft #103 reports **38 changed files**,
  all of whose *file paths* also appear in #102. Path overlap is **not**
  proof of identical content. Diff these side by side and choose one coherent
  integration target; do not blindly merge both.
- Draft PRs #84, #85, #87–#92 and #96–#101 also cover authentication,
  notifications, support, Developer API, packaging, release honesty,
  email acknowledgement, model artifacts and readiness. Check for superseded
  branches and already-merged source blobs before applying fixes.
- PR #104 (Sophia runner) is separate tooling and does not prove a live
  agent inspected or modified the product.
- Latest CI and the new Replit contract workflow show `failure`, but
  inspected jobs have **zero recorded steps**. Treat tests as **not
  executed** pending runner/billing resolution, not as failures in code
  and not as passing evidence.
- The base commit's combined status reports a failing Vercel context.
  Investigate independently rather than interpreting it as a Replit test.

## Release decision: NO-GO

The existing integration PR descriptions report a divergent Replit checkout,
PDIM owner lease conflicts and HTTP 502 in the live workspace. These issues
must be diagnosed without forcing PDIM lease unlocks or deleting backing data.
A previous scaled development-VM simulation in
`reports/readiness-implementation/launch-blockers-current.md` is valid
only for its documented boundaries, not live deployment proof.

### Prioritized engineering execution

1. **Preserve evidence and protect state:** snapshot current Replit commit,
   dirty tree, Nix channel, `.replit` port mappings, service state, data
   mounts and recovery artefacts. No destructive sync.
2. **Resolve GitHub integration:** diff and reconcile #102 versus #103
   and overlapping reviewed branches into a single candidate branch.
   Preserve previous proven behavior and add conflict-specific tests.
3. **Repair actual Replit readiness blockers:** investigate HTTP 502 and
   PDIM ownership using read-only probes first, then reversible patches;
   never force-claim clean recovery.
4. **Execute tests on an isolated source checkout:** Node server/client
   type checks, focused route/security tests, full unit/integration suites,
   Python/MaxCore tests, Nix evaluation, capsule build/restore, port checks,
   dependency audit and secret scanning; record genuine exit codes.
5. **Verify production-process behavior:** isolated Neon, Redis/PDIM recovery,
   worker idempotency, model quality/format, authenticated authorization,
   observability, representative p95 workloads, email/payment sandbox
   contracts and rollback tests. Do not invoke live provider charges.
6. **Sync after passing gates:** reconcile the validated candidate into the
   Replit workspace without overwriting secrets, local user state or the
   untracked `.replit`; apply `.replit.example` settings manually only
   where the current environment needs them. Re-run checks on the actual
   Replit VM before an owner-controlled publish.

## Source references

- Replit configuration:
  https://docs.replit.com/references/project-setup/configuration
- Replit dependencies:
  https://docs.replit.com/references/project-setup/dependency-management
- Integration candidates: https://github.com/20lawsobk/maxbooster7.5/pull/102
  and https://github.com/20lawsobk/maxbooster7.5/pull/103
- Deployment notes: `docs/pr84-replit-verification.md`,
  `replit.md`, `start.sh`, `scripts/port-contract.sh`.
