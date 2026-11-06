# AGROS: senior engineering workflow for Max Booster

The active target is **admin-private**: the existing administrator can use the entire platform. Public self-service registration, mass onboarding and general availability can wait. All twelve music domains remain in scope. This is the user's explicit scope change, not an automatic reduction in quality requirements.

The paired verifier and repair coordinator now use a detailed specialist task catalog. There are **18 roles, 86 task templates, and 625 expanded assignments** (37 platform tasks plus 49 tasks for each of 12 domains). Each assignment includes one owner, a different reviewer, prerequisites, exact ordered steps, inputs, deliverables, acceptance criteria, verification expectations, permitted source paths, failure routing and a time budget. The catalog is a discovery baseline: execution must map actual routes, entities, controls and failure cases before claiming complete coverage.

## Programs and artifacts

- `verify.py` executes the configured checks, pins source/policy/controller identity, emits PASS/FAIL/UNVERIFIED and a detailed team plan, and can invoke repair.
- `repair.py` creates an isolated Git candidate, dispatches the team or a legacy adapter, rejects protected edits and regressions, then calls the verifier again. The original checkout is never automatically merged or deployed.
- `team.py` expands the catalog, schedules dependencies, invokes configured owner/check/reviewer processes, validates their evidence contracts, and persists resumable task receipts.
- `team_catalog.json` contains the full machine-readable organization and task contracts. `TEAM_PLAYBOOK.md` presents the same responsibilities and ordered task details for review.
- `admin_release.json` defines 63 required private-release criteria: 48 domain journeys plus 15 access, persistence, integration, financial and operational requirements. `admin_release.py` collects fresh evidence and makes the separate admin decision.

Python 3.11+, Linux, Git and the documented project runtime are required. No Python packages are needed for the orchestration itself. Application checks still need their real dependencies and disposable services.

```sh
python3 agros/verify.py --root . --state /tmp/maxbooster-agros
python3 agros/verify.py --root . --state /tmp/maxbooster-agros --repair --cycles 4
python3 agros/team.py --root . --report /tmp/maxbooster-agros/latest.json --state /tmp/maxbooster-team-plan
python3 -m unittest discover -s agros -p 'test_*.py'
```

Verification exit 0 means the **active release target** has passed for the observed source. For the supplied policy this requires `active_release.ready`, not public readiness. `report.ready` and the diagnostic score retain the original full-platform meaning; `active_release.public_release_ready` repeats it explicitly. Exit 2 means the source target has not been proven ready. A validated candidate does not make the original checkout ready. Repair exit 3 means missing execution capabilities; exit 4 means a stopped, failed, regressing or exhausted attempt. No success or skipped check is invented.

## Private admin acceptance

The administrator must be able to use artist management, fan management, projects, studio, distribution, marketing, revenue, assistant, collaboration, marketplace, subscriptions and administration. The inventory criterion additionally requires every discovered admin control to map to an exercised scenario; four catalog journeys per domain are not a substitute for that inventory.

Private application access must be enforced by the server. Login, MFA, session renewal/revocation and recovery are required. Admin feature entitlements must not depend on purchasing a public plan, while real provider charges, payment settlement and financial authorization remain truthful. Explicitly owner-published sharing/fan content may be public without exposing private account access. Public self-registration stays closed by default.

Private readiness requires all 63 criteria with actual artifact references; zero critical/high security findings; zero blocking accessibility violations; API p95 no more than 250 ms; page load no more than 2 s under the measured admin workload; and passing build, types, lint, unit, integration, regression, security, startup and final source-to-artifact checks. Persistence across restart, authentic provider outcomes, backup restoration, monitoring and rollback remain mandatory. Full-platform coverage thresholds are retained for later public readiness; they do not silently become an admin coverage claim.

Configure `admin_release_argv` with a trusted acceptance harness using `{request}` and `{evidence}`; optional placeholders are `{root}` and `{artifacts}`. The request pins a nonce, source/head and manifest digest. The producer must execute real acceptance checks and write JSON copying `schema`, `id`, `nonce`, `head`, `source_sha256`, and `manifest_sha256`, plus:

- `environment`: the actual isolated/staging deployment tested.
- `criteria`: exactly all manifest criterion IDs, each with `status` PASS/FAIL/UNVERIFIED and nonempty `evidence` paths relative to the supplied artifact directory.
- `metrics`: all named manifest measurements as finite numbers, never booleans or invented values.

A zero process exit without valid evidence cannot pass. Missing, skipped, stale, symlinked, nonfinite or incomplete evidence fails acceptance. Source/controller changes invalidate the final decision. The configured producer is a trusted measurement boundary: narrative assertions or fixture tests must never stand in for actual app evidence.

## Specialist execution and handoffs

The default team is enabled but its executors, reviewers and independent checks are empty. This exposes concrete blocked assignments immediately; it does **not** pretend to run eighteen AI workers. Connect trusted sandboxed role executors through `policy.team.executors[role]`, reviewers through `policy.team.reviewers[role]`, and independent validation argv arrays through `policy.team.checks[template_id]`. Owner and reviewer invocations are separate; they are not proof of distinct humans or distinct models.

Each owner/reviewer argv must accept `{request}` and `{response}`. Additional placeholders are `{root}` and `{artifacts}`. Commands run without a shell. Each task request contains role duties, private-release scope, the exact task, original verification findings, dependency receipt paths, source hash and unique nonce. Responses must copy the schema, task ID, nonce and source hash exactly. Owners must account for all ordered steps and acceptance criteria, list real artifact files, and return COMPLETE; a claimed completion still requires the separately configured commands to pass and the reviewer to ACCEPT the exact artifact hashes. The request includes the full response contract.

Analysts and reviewers cannot change source. Implementation tasks can edit only declared source scopes; the catalog's broad scopes are upper bounds and the `d_tasks` handoff must specify exact files and actions. Source changes are serialized in one candidate to prevent conflicting ownership. Parallel workers, if a future adapter uses them internally, still need isolated workspaces and reviewed integration; this scheduler does not claim concurrent execution.

Cross-domain foundation handoffs precede domain work. The final private-release assembly waits for every domain's admin journey and release packet. Security-blocking tasks and their prerequisites take priority; missing security capabilities stop unrelated feature dispatch. Missing owner/reviewer/check commands remain BLOCKED rather than DONE.

## Bounds, evidence and learning

The default dispatch budget is 24 completed tasks and 3,600 seconds per invocation, 900 seconds per owner/check command, and 300 seconds per review. Template limits further bound owners. Commands terminate their process groups on timeout, Ctrl-C or SIGTERM. Dispatch writes a RUNNING record before work; an interrupted task cannot be resumed as completed without investigation.

Successful receipts pin before/after source hashes, owner and reviewer results, actual independent check exits, changed paths and artifact hashes. Resume requires the same candidate content, HEAD, plan/report, settings and controller/catalog versions, with intact receipt chains and satisfied dependencies. Earlier receipts are historical snapshots; only fresh final-source verification confers readiness. Artifact tampering, scope escapes, validation edits, Git commits, reviewer mutations and malformed responses stop the attempt.

Task history records failures and runtime per template and influences only ready-task ordering. Failure routing names the responsible specialist; root-cause and learning assignments require measured findings and separate review. The programs do not rewrite their own rules, skip required criteria, lower thresholds or claim that a failed attempt improved accuracy. A failing task stops blind retries; revised work requires a new verified candidate and report.

To resume a budget-exhausted team run, use its exact candidate, original report, unchanged policy and exact team state with `team.py --run`. Its ledger and outcome retain the paths. On team PASS, run the full verifier on that candidate; task success is not application readiness. The repair coordinator uses a new evidence directory for each fully reverified attempt, so new source reports cannot reuse stale task receipts.

## Protected changes and runtime boundary

Legacy `repair_argv` remains supported when `team.enabled` is false. In either mode, tests, policy/runner files, CI, agent instructions, package manifests/lockfiles, configuration and environment files remain protected. Team QA may add new regular test-shaped files only under `agros-generated-tests/`; it cannot modify existing tests there. Those additions are not automatically part of the project's suites: a trusted check must execute them explicitly, and integration into the normal suite is separately reviewed. Tasks needing protected files produce proposals in private artifacts.

A Git worktree and path checks are not a security sandbox. Execute adapters and app checks in a disposable restricted environment without production credentials. Role commands are trusted integrations and must provide their own model/provider connection. No credentials, live billing operations, public load tests, permanent scheduler, production monitoring agent, auto-merge or publishing capability is installed here.

Source identity retains fixtures and unknown distributions; explicit generated output/dependency prefixes and exactly the regenerated endpoint-audit JSON/Markdown files are excluded. The final production launcher contract independently checks source-to-artifact hashes and the emitted asset list. Metrics retain non-weakenable numeric floors, and failed prerequisites cannot be overridden by metric success.

Reports/logs are private and may contain application information. Retain them outside source and redact before sharing. To disable dispatch, omit `--repair` or disable the team. Stop the process to cancel active commands. To roll back a candidate, preserve its evidence/diff and discard only that isolated worktree through the normal Git workflow. Nothing here merges or deploys a candidate automatically.
