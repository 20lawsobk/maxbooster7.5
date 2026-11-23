# Claude SDK runtime for audit assistance

`production_audit_ai.py` and model-assisted repository understanding use the
official Anthropic SDKs, not hand-built HTTP requests. Each operation makes one
Claude request through the selected SDK runtime:

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
All runtimes require `ANTHROPIC_API_KEY` in the process environment.

`production_audit_suite.py` uses the same runtime selector. A normal launch
selects both read-only `--ai-review` and guarded `--ai-remediate`; it asks for
confirmation before sending findings or making changes. Non-interactive use
must pass `--confirm-ai`. The run requires `ANTHROPIC_API_KEY` and fails closed
if it is absent. Use `--local-only` (or its `--audit-only` alias) to bypass AI
and run only the deterministic local audit. Passing only `--ai-review` or only
`--ai-remediate` selects that single mode.

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
The command above selects review only; omit the mode flags to run the full
confirmed review-and-remediation sequence by default.

Use `--local-only` when running in CI or another environment where external
model calls and repository edits are not intended. Neither AI mode makes the
heuristic audit a production certification.

Model-assisted repository analysis sends eligible source excerpts to Anthropic
only after the existing source-upload confirmation. Files flagged by the
secret scanner remain withheld. Model-assisted remediation continues to apply
the existing file-scope, deterministic executor, test, and rollback gates; an
SDK response is never applied directly.

The deterministic `--local-only` audit does not require the API key or any
Claude SDK call. No live API request is made by the automated tests.
