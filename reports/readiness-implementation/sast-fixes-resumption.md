# SAST source-fix resumption

## Scope and disposition

The two actionable source findings identified in `sast-resumption.md` were
rechecked against current source and repaired. No application workflow, live
service, external request, credential, dependency, lockfile, or shared
configuration was changed or started.

This is focused source remediation evidence, not a clean full-SAST attestation.
The release gate remains subject to the full-scan and production-readiness
blockers recorded in `sast-resumption.md` and `remaining-gap-execution.md`.

## Repairs

### Intent URL SSRF boundary

`external/maxcore/artifacts/ai-training-server/ai_model/intent/url_reader.py`
no longer passes an untrusted URL to `urllib.request.urlopen`.

It now uses the repository's existing `ai_model.native_analysis.safe_http`
transport with a 64 KiB response limit, the caller's timeout as an overall
deadline, HTML/XHTML content-type restrictions, and at most three redirects.
That transport:

- accepts only HTTP and HTTPS and rejects URL credentials and malformed hosts;
- resolves and rejects the destination if any answer is non-public, including
  loopback, private, link-local, reserved, mapped, and transition addresses;
- repeats validation for every redirect;
- connects directly to the already validated IP while retaining the canonical
  hostname for the HTTP Host header, TLS SNI, and certificate verification,
  preventing a second DNS lookup from enabling rebinding; and
- bypasses environment proxy routing.

Unsafe URLs and transport failures return the existing partial `UrlContent`
rather than being fetched, preserving the reader's documented no-raise
behavior and hostname/platform hint behavior.

### Build shell construction

`script/build.ts` now invokes `du` with
`execFileSync("du", ["-sb", "--", target])`. The measured path is an argv value,
not shell source. The existing `--` option boundary and null-on-measurement-
failure behavior are preserved. The helper is exported only to permit direct
focused regression coverage.

## Focused verification

All checks were local and made no network requests.

1. `PYTHONPATH="$PWD" pytest -q tests/test_intent_url_reader_safe_http.py tests/test_native_analysis_safe_http.py`
   from the AI training server directory: **13 passed**. This covers the
   URL-reader safe-transport wiring and bounds, explicit unsafe rejection,
   scheme/credential/non-public-address rejection, mixed public/private DNS
   rejection, IPv6 transition-address rejection, and redirect revalidation.
2. `npx vitest run tests/unit/build-du-argv.test.ts --config vitest.config.ts`:
   **1 passed**. A real directory name containing shell command-substitution
   syntax was measured while the would-be side-effect file remained absent.
3. Focused TypeScript no-emit compilation of `script/build.ts` and its test
   passed.
4. Python byte compilation of the changed reader and focused test passed.
5. `git diff --check` passed for both changed source files and both focused
   tests.

## Residual risks and blockers

- A complete scan of the current immutable inventory is still required. These
  fixes do not resolve or disposition other findings, prior parser errors, or
  the incomplete full-scan evidence.
- The safe HTTP implementation uses the first validated public DNS answer for
  a request. This is fail-closed when any answer is non-public and is
  rebinding-safe because the connection is IP-pinned, but it does not retry
  alternate public answers if the first address is unavailable.
- `read_url` intentionally retains its pre-existing best-effort contract:
  callers receive partial/empty content rather than the rejection reason.
  Rejection is explicit at the safe transport boundary (`SafeHTTPError`) and
  tested there, but this high-level API does not expose diagnostics.
- Availability of the host `du` executable remains a deployment-environment
  prerequisite. Missing or failing `du` continues to produce `null`, which its
  caller converts into an explicit failed pre-flight measurement.