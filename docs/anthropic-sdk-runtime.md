# Claude SDK runtime for audit assistance

`production_audit_ai.py` is the single model-transport boundary for audit review,
tool-using remediation, and model-assisted repository understanding. It uses the
official Anthropic SDKs only; no feature constructs its own provider HTTP
requests. Each operation goes through exactly one selected SDK runtime:

- `python` (default): Python `anthropic` package declared in `pyproject.toml`.
- `node`: root `@anthropic-ai/sdk`, called through `scripts/anthropic-sdk-client.mjs`.
- `dotnet`: C# `Anthropic` package via `tools/anthropic-sdk-dotnet`.

Set `ANTHROPIC_SDK_RUNTIME` to `python`, `node`, or `dotnet`. Do not configure
multiple runtimes for one operation; the adapters are alternatives, not a
fan-out, so a single audit request is not billed three times.

The Python SDK is used by default. Node selection requires the project Node
dependencies to be installed. .NET selection builds/runs the small `net9.0`
client against the configured .NET SDK and restores its pinned NuGet dependency
when needed. It can roll forward to a later installed .NET runtime.
All runtimes require `ANTHROPIC_API_KEY` in the process environment because the
SDK authenticates requests to Anthropic. The SDK replaces hand-written transport
code; it does not remove the need for an Anthropic account credential.

`production_audit_suite.py` is the supported entry point for a deterministic
audit and the suite's guarded AI review/remediation. Its npm commands are:

- `npm run audit:production`: audit-only; no network calls or file edits.
- `npm run audit:production:review`: audit plus read-only AI review.
- `npm run audit:production:apply`: audit, guarded remediation with
  re-audits, then a read-only AI review of the final report.
- `npm run test:production-audit-suite`: run focused tests for the suite and all
  three SDK runtimes.

The npm commands only run remediation through the explicitly named `:apply`
command. The CLI's `--apply` and `--ai-remediate` switches select the guarded
remediation stage. AI modes ask for confirmation before sending eligible
findings or making changes. Non-interactive use must pass `--confirm-ai`; the
key is required and absence fails closed. `--local-only` (also `--audit-only`)
bypasses all AI calls and runs only the deterministic audit. `--ai-review`
alone selects the read-only review.

For compatibility, a bare `python3 production_audit_suite.py` invocation
continues to select both AI review and guarded remediation; it still requires
interactive confirmation. Prefer the named audit-only npm command when a
read-only local run is intended.

Review sends a bounded audit summary. Remediation can inspect eligible
repository files, edit files, and run the selected test command. It continues
to withhold files containing detected secrets, refuse manifest edits, and
revert changes that fail its syntax, audit-regression, or test gates. Backups
are written outside the repository by default.

Example:

```sh
python3 production_audit_suite.py --ai-review --sdk-runtime node --confirm-ai
```

Set the key through the workspace secrets manager before running the command.
The command above selects review only. To include guarded remediation in the
same invocation, add `--apply`; the remediation loop re-audits after edits and
the review then receives the final report.

Use `--audit-only` when running in CI or another environment where external
model calls and repository edits are not intended. Neither AI mode makes the
heuristic audit a production certification.

Model-assisted repository analysis sends eligible source excerpts to Anthropic
only after the existing source-upload confirmation. Files flagged by the
secret scanner remain withheld. Model-assisted remediation continues to apply
the existing file-scope, deterministic executor, test, and rollback gates; an
SDK response is never applied directly.

The deterministic `--local-only` audit does not require the API key or any
Claude SDK call. No live API request is made by the automated tests.
