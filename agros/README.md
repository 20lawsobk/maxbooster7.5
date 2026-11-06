# AGROS: Max Booster verification and repair

These two executable Python programs implement a bounded evidence/repair loop around Max Booster's existing npm commands. They are an orchestration foundation, not proof that the product is production ready or a replacement for the product's services. Python 3.11+, Linux, Git and the project's documented Node/npm runtime are required. No Python packages are needed.

## Programs

- `verify.py`: scans the actual revision and source content, executes every required configured gate, records PASS/FAIL/UNVERIFIED, enforces fresh numerical evidence, writes a task report, and optionally invokes repair.
- `repair.py`: creates a dedicated Git worktree and candidate branch, calls a configured repair executor, rejects protected changes, verifies the candidate, and repeats with updated failure evidence. It stops on success, timeout, regression, repeated patches, executor failure, or its attempt limit.

```sh
python3 agros/verify.py --root . --state /tmp/maxbooster-agros
python3 agros/verify.py --root . --state /tmp/maxbooster-agros --repair --cycles 4
python3 -m unittest discover -s agros -p 'test_*.py'
```

Exit 0 from verification means all configured release gates passed for the observed source snapshot. Exit 2 means source readiness has not been demonstrated. A validated repair remains a candidate and does not mark the original checkout ready. Repair exit 3 means no executor is configured; exit 4 means blocked, repeated, failed, or regressing changes. Reports and patches remain available for review. The source checkout is never automatically merged or deployed.

## Configure evidence and execution

The supplied policy maps observed repository scripts for build, type checking, lint, unit tests, isolated integration/browser page acceptance, runtime regression contracts, dependency audit and production simulation. Those commands have not been executed against Max Booster in this delivery. Inspect their current implementations and run them against disposable services before enabling this runner. Existing scripts can require secrets, services, browsers or downloaded dependencies. The `start` gate currently maps to `simulate:production`; replace it with a production start/health/shutdown acceptance harness before treating it as release evidence.

Coverage, accessibility, performance, feature completeness, operations and documentation are deliberately UNVERIFIED until their evidence producers are configured. Numerical gates use `evidence_argv`, an argv array containing `{evidence}`. The producer must write JSON to that unique path and return zero. Coverage requires lines, branches, functions and statements >=95; accessibility requires violations <=0; performance requires api_p95_ms <=250 and page_load_seconds <=2. Unknown, absent, malformed and nonfinite measurements cannot pass. Do not substitute a static hand-authored file for a measurement producer.

Feature acceptance must exercise artist/fan/project management, studio, distribution, marketing, revenue, assistant, collaboration, marketplace, subscriptions and admin across roles and tenants. Operations acceptance must exercise deployment, health, migrations, backup restoration, monitoring, alerting and rollback in an isolated staging environment. Dependency audit alone does not establish application security, GDPR/CCPA compliance or SOC2 assurance. Extend security acceptance to authorization, tenant isolation, abuse and prompt-injection paths with real results.

`repair_argv` is null by default. Configure a trusted executor as an argv array, for example `["/opt/agros/repair-adapter", "--request", "{request}", "--workspace", "{root}"]`. This is an integration contract, not a bundled AI implementation: the adapter reads the structured request and edits only the isolated candidate. Provide its own SDK/model connection through the executor environment. No provider credentials are embedded or requested by these programs. Missing dependencies in the new worktree must be provisioned by your sandbox/executor before checking; they are not automatically installed.

The adapter can implement missing services, integrations, frontend/backend code and tests in separately reviewed tasks. Automatic repair here blocks modifications to tests, policy/runner files, CI, agent instructions, package manifests/lockfiles, config files and environment files. Changes requiring those paths must be reviewed outside this automatic loop; this prevents the repair executor from making a broken product appear healthy by changing validation.

## Learning and limits

`learning.json` records each gate's runs, failures and duration. Subsequent scans prioritize historically failing inexpensive checks. No gate is skipped, no cached success is reused, and no threshold is reduced. Repair requests include the last report, attempt number and logs, allowing a trusted executor to adapt its approach. The programs do not rewrite themselves. Improvements to the runner or policy require code review and regression tests.

A score is a diagnostic percentage of passing gates, not a statistical guarantee. Every gate must pass even when the target is 98. Readiness also requires no source mutation during checks. Full scans run after every repair rather than relying on guessed dependency relationships.

The OS process timeout terminates command descendants; Ctrl-C cancels the active command. A source coordinator lock prevents duplicate coordinators sharing the same state directory. Use one private state directory per source checkout and never start direct repairs concurrently. Reports are written atomically with private permissions. Logs can contain application secrets: retain them privately, redact before sharing, and do not commit the state directory.

A Git worktree isolates files, not credentials or network access. Execute adapters and project commands inside a disposable restricted container without production credentials. Path checks are regression protections, not a hostile-code security sandbox. No production deployment, load/penetration tests against public hosts, permanent scheduler, monitoring agent, self-healing infrastructure, or publishing is installed by this change.

To disable, stop the process or omit `--repair`; to roll back, discard the candidate worktree after saving any desired diff. Existing source files are untouched. Review and merge a validated candidate through the normal release process, then run the full product staging and deployment verification.
