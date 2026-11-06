# AGROS: Max Booster verification and repair

These two executable Python programs implement a bounded evidence/repair loop around Max Booster's existing npm commands. They are an orchestration foundation, not proof that the product is production ready or a replacement for the product's services. Python 3.11+, Linux, Git and the project's documented Node/npm runtime are required. No Python packages are needed.

## Programs

- `verify.py`: scans the actual revision and source content, executes every required configured gate, records PASS/FAIL/UNVERIFIED, enforces fresh numerical evidence, writes a task report, and optionally invokes repair.
- `repair.py`: creates a dedicated Git worktree and candidate branch, calls a configured repair executor, rejects protected changes, verifies the candidate, and repeats with updated failure evidence. It stops on success, timeout, regression, repeated patches, executor failure, or its attempt limit. Gates that begin passing during repair become regression requirements for subsequent attempts. Stale/foreign reports, changed source revisions, adapter commits, and renames or deletions from protected paths are rejected.

```sh
python3 agros/verify.py --root . --state /tmp/maxbooster-agros
python3 agros/verify.py --root . --state /tmp/maxbooster-agros --repair --cycles 4
python3 -m unittest discover -s agros -p 'test_*.py'
```

Exit 0 from verification means all configured release gates and the final artifact contract passed for the observed source snapshot. Exit 2 means source readiness has not been demonstrated. A validated repair remains a candidate and does not mark the original checkout ready. Repair exit 3 means no executor is configured; exit 4 means blocked, repeated, failed, or regressing changes. Reports and patches remain available for review. The source checkout is never automatically merged or deployed.

## Configure evidence and execution

The supplied policy maps observed repository scripts for build, type checking, lint, unit tests, isolated integration/browser page acceptance, runtime regression contracts, and dependency audit. Runner unit tests do not establish that these product commands pass for a particular revision. Inspect current source-bound product verification separately and run commands against disposable services before enabling this runner. Existing scripts can require secrets, services, browsers or downloaded dependencies. The `start` gate is UNVERIFIED until a production start/health/shutdown acceptance harness is configured; a simulation is not startup acceptance.

Coverage, accessibility, performance, feature completeness, operations and documentation are deliberately UNVERIFIED until their evidence producers are configured. Numerical gates use `evidence_argv`, an argv array containing `{evidence}`. The producer must write JSON to that unique path and return zero. The runner enforces coverage floors of 95, while the supplied policy preserves the repository’s stronger 100 requirement for lines, branches, functions and statements; accessibility requires violations =0; performance requires api_p95_ms in [0,250] and page_load_seconds in [0,2]. These minimum acceptance limits are enforced by the runner and cannot be removed or weakened through policy changes. Unknown, absent, malformed, boolean and nonfinite measurements cannot pass. A successful evidence producer cannot override a failed prerequisite command. Evidence must be a fresh regular file, not a symlink. Do not substitute a static hand-authored file for a measurement producer.

Feature acceptance must exercise artist/fan/project management, studio, distribution, marketing, revenue, assistant, collaboration, marketplace, subscriptions and admin across roles and tenants. Operations acceptance must exercise deployment, health, migrations, backup restoration, monitoring, alerting and rollback in an isolated staging environment. Dependency audit alone does not establish application security, GDPR/CCPA compliance or SOC2 assurance. Extend security acceptance to authorization, tenant isolation, abuse and prompt-injection paths with real results.

`repair_argv` is null by default. Configure a trusted executor as an argv array, for example `["/opt/agros/repair-adapter", "--request", "{request}", "--workspace", "{root}"]`. This is an integration contract, not a bundled AI implementation: the adapter reads the structured request and edits only the isolated candidate. Provide its own SDK/model connection through the executor environment. No provider credentials are embedded or requested by these programs. Missing dependencies in the new worktree must be provisioned by your sandbox/executor before checking; they are not automatically installed.

The adapter can implement missing services, integrations, frontend/backend code and tests in separately reviewed tasks. Automatic repair here blocks modifications to tests, policy/runner files, CI, agent instructions, package manifests/lockfiles, config files and environment files. Changes requiring those paths must be reviewed outside this automatic loop; this prevents the repair executor from making a broken product appear healthy by changing validation.

The supplied `artifact_contract_argv` calls the existing production launcher’s `validateBuild` after all gates. This separately validates source-to-artifact hashes and the emitted asset list. Reports retain the validator status/log and the final `dist/build-complete.json` digest. Missing or failing artifact validation blocks readiness even if all other gates pass; changing generated bytes cannot silently satisfy this check.

## Learning and limits

`learning.json` records each gate's runs, failures and duration. Subsequent scans prioritize historically failing inexpensive checks. No gate is skipped, no cached success is reused, and no threshold is reduced. Repair requests include the last report, attempt number and logs, allowing a trusted executor to adapt its approach. The programs do not rewrite themselves. Improvements to the runner or policy require code review and regression tests.

A score is a diagnostic percentage of passing gates, not a statistical guarantee. Every gate must pass even when the target is 98. Readiness also requires no source or policy mutation during checks. Source identity includes contents, symlink destinations and file modes; reports pin both the source and policy digests used by the checks. Generated output bytes are not source: the explicit exclusion list covers root `dist`, observed subsystem `dist` directories, known dependency/cache roots, and the two generated files `reports/endpoint-audit.json` and `reports/endpoint-audit.md`. It deliberately retains unknown `dist` paths, all fixtures, and documentation/report source files. Gate report/coverage environment destinations point to the private run directory. Starting a scan invalidates the previous latest result; an interrupted scan cannot leave old readiness evidence eligible for repair. Full scans run after every repair rather than relying on guessed dependency relationships.

The OS process timeout terminates command descendants; Ctrl-C cancels the active command. A source coordinator lock prevents duplicate coordinators sharing the same state directory, and a separate repair lock serializes direct and coordinated repairs. Use one private state directory per source checkout. Ctrl-C and SIGTERM cancel the active command and terminate its process group. Reports are written atomically with private permissions. Logs can contain application secrets: retain them privately, redact before sharing, and do not commit the state directory.

A Git worktree isolates files, not credentials or network access. Execute adapters and project commands inside a disposable restricted container without production credentials. Path checks are regression protections, not a hostile-code security sandbox. No production deployment, load/penetration tests against public hosts, permanent scheduler, monitoring agent, self-healing infrastructure, or publishing is installed by this change.

To disable, stop the process or omit `--repair`; to roll back, discard the candidate worktree after saving any desired diff. Existing source files are untouched. Review and merge a validated candidate through the normal release process, then run the full product staging and deployment verification.
