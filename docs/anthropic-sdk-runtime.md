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

`production_audit_suite.py` uses the same runtime selector for its optional
`--ai-review` and `--ai-remediate` modes. The default audit remains local and
deterministic. AI modes require an API key and explicit confirmation
(`--confirm-ai` for non-interactive use). Review sends a bounded audit summary;
remediation can inspect eligible repository files, edit files, and run the
selected test command. Remediation continues to withhold files containing
detected secrets, refuse manifest edits, and revert changes that fail its
syntax, audit-regression, or test gates. Backups are written outside the
repository by default.

Example:

```sh
python3 production_audit_suite.py --ai-review --sdk-runtime node --confirm-ai
```

Set the key through the workspace secrets manager before running the command.

Use `--ai-remediate` instead of `--ai-review` only when you intend to permit
guarded code edits and local test execution. This does not make the heuristic
audit a production certification.

Model-assisted repository analysis sends eligible source excerpts to Anthropic
only after the existing source-upload confirmation. Files flagged by the
secret scanner remain withheld. Model-assisted remediation continues to apply
the existing file-scope, deterministic executor, test, and rollback gates; an
SDK response is never applied directly.

The normal deterministic audit does not require the API key or any Claude SDK
call. No live API request is made by the automated tests.
