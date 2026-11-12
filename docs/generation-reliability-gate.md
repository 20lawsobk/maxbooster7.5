# Generation reliability gate

The live-runner matrix is `tests/e2e/generation-path-matrix.json`. The broader source-traced UI inventory is `tests/e2e/generation-surface-inventory.json`; it records reachable creative flows, their backend and MaxCore paths, ownership, output class, linked checks, and non-creative operations that should not be mislabeled as model generation. Keep both files aligned with route registration and the page/component that submits each request.

## Current URL-generation failure behavior

`POST /api/social/generate-from-url` now distinguishes:

- `SOURCE_NOT_ANALYZABLE` (HTTP 422): the URL was rejected by the safe source analyzer.
- `MAXCORE_SERVICE_UNAVAILABLE` (HTTP 503): MaxCore explicitly reported unavailable.
- `MAXCORE_AUTHORIZATION_FAILED` (HTTP 503): the configured MaxCore generation authorization was rejected.
- `MAXCORE_EMPTY_GENERATION` (HTTP 503): MaxCore answered, but no platform returned usable copy.
- `MAXCORE_TRANSPORT_FAILED` (HTTP 503): transport failed before usable copy was returned.

The response contains only a safe category, a user-actionable message, and the affected platform IDs. It never forwards prompts, source URLs, credentials, or raw provider errors. The existing Social Media URL composer displays `error.message` and clears its loading state so the user can act on the specific failure.

## Running the gate safely

First inspect the plan without network or account access:

```sh
node scripts/testing/generation-reliability-gate.mjs --plan
```

The live gate refuses production origins and requires all of the following:

- `MAXBOOSTER_GENERATION_E2E_BASE_URL` and `MAXBOOSTER_GENERATION_E2E_ALLOWED_ORIGIN` with an exact matching localhost or Replit development origin. `*.replit.app` is always refused.
- A dedicated non-admin test account through `MAXBOOSTER_GENERATION_E2E_USERNAME`, `MAXBOOSTER_GENERATION_E2E_PASSWORD`, and its exact `MAXBOOSTER_GENERATION_E2E_ACCOUNT_ID`.
- `MAXBOOSTER_GENERATION_E2E_CONFIRM_ISOLATED=1` as an explicit confirmation that the account and its data are disposable test data.
- `MAXBOOSTER_GENERATION_E2E_PROVIDER_RECEIPT` containing a non-production test-setup assertion with `nonProduction: true`, a provider name, and a future ISO `expiresAt`. This is an operator assertion, not a provider-signed credential or proof of provider configuration.
- For image/audio/video, `MAXBOOSTER_GENERATION_E2E_ALLOW_MEDIA_WRITES=1` **and** MaxCore must advertise both owner-scoped artifact storage and verified cleanup for that modality. Without these capability fields, the gate skips media requests, preventing orphaned or cross-account artifacts.

Example receipt shape (not a credential):

```json
{"nonProduction":true,"provider":"configured-test-provider","expiresAt":"2099-01-01T00:00:00.000Z"}
```

Set `MAXBOOSTER_GENERATION_E2E_SOURCE_URL` to a public HTTPS page when the default `https://example.com/` is unsuitable. The gate does not fetch that URL itself; it submits it to MaxBooster's normal SSRF-guarded URL flow.

Exit codes are `0` only when every path in scope passes, `1` for a real assertion/cleanup failure, and `2` when any path is blocked or deliberately outside the selected scope. Output is JSON and omits generated content, prompts, credentials, raw upstream errors, and full URLs.

## Boundaries and current evidence

The route matrix covers URL-to-social-copy, manual social text, shared text, advertising text, URL-to-image/audio/video, and shared image/audio/video. Audio/video jobs are bounded-polled and registered for owner-only cleanup. Studio's long-running audio-job path remains listed but is not executed until its job and artifact lifecycle exposes a verified delete contract.

The source inventory covers 21 client-reachable creation/rewrite/rendering flows and classifies seven adjacent non-creative operations. The live-runner matrix is narrower: a row the runner does not execute or whose safe preflight is missing remains `BLOCKED`; source wiring or a mocked browser fixture is not counted as a real provider-generated result. A modality may be ready in live-awareness or procedural mode while `model_loaded=false`; readiness and learned-checkpoint state are recorded separately.

On 2026-11-12, after restarting the development workflow, `/api/health` and `/api/ready` returned HTTP 200 and the app readiness payload reported a fresh unified awareness snapshot. MaxCore's `/api/ready` reported `ready=true`, `generation_ready=true`, `live_awareness_generation_ready=true`, `model_loaded=false`, and `trained_checkpoint_ready=false`; text was live-awareness serving and image/audio/video were untrained procedural renderers. This is runtime readiness evidence, not a successful generated media artifact or trained-model claim.

A separate one-off development request using an administrator account returned HTTP 200 with a non-empty URL-based social-text variant. The test did not use a disposable regular account and is not counted as isolated E2E acceptance. The earlier screenshot's 503 was not reproducible in that one request.

The full live gate remains `BLOCKED`: this checkout does not have the dedicated isolated-account settings or a non-production provider-test receipt. In addition, the live MaxCore capability response does not advertise the owner-scoped media storage and cleanup contract required before the gate will create image/audio/video outputs. No media test jobs or artifacts were created.
