# Fused MaxCore + awareness: bounded evaluation protocol v1

## Concrete live integration (v2, preferred)

After parent readiness, the prepared command is:

```
MAXCORE_FUSED_PARENT_READY=yes MAXCORE_FUSED_ALLOW_GENERATION=yes \
node scripts/evaluate-maxcore-fused.mjs ready-live
```

No contract file is needed. The actual API runner reads `E2E_USERNAME` and
`E2E_PASSWORD` for normal `/api/auth/login` (optional `E2E_TWO_FACTOR_CODE`),
or reuses `E2E_SESSION_COOKIE`. CSRF is obtained normally. Origin is
`MAXCORE_FUSED_BASE_URL`, otherwise the Replit development domain, otherwise
localhost:5000. It GETs readiness/status/capabilities and POSTs the read-only
context query, freezes the actual context/source provenance and checkpoint
digest before generation, and never sends fictional awareness as live knowledge.
Fictional prompts are sent to the actual text/audio/video APIs. Semantic media
requests are never silently changed into gradients or procedural instrument demos.
Unsupported media is therefore an explicit rejection, not a substitute success.

Run output is under `reports/maxcore-fused/live-TIMESTAMP/`: pre-generation
snapshot, returned canonical per-attempt snapshot provenance, generated fictional
text, hashes, replay evidence, and bounded media artifacts/probes when available.
It makes at most 140 HTTP calls within 12 minutes, each <=120s; media bodies <=32MiB
and JSON <=4MiB. Only text/spec requests repeat, byte-identically; media jobs poll
at most 12 times with two-second spacing. Only same-origin authenticated artifact
URLs are fetched; no session forwarded externally. ffprobe counts decoded frames
and ffmpeg decodes the entire file, each bounded to 30 seconds. Downloads/jobs
outside these bounds remain NOT_ESTABLISHED.

The inspected text API exposes cache hits but no normal-user cache eviction or
uncached replay switch. The runner **does not invent one**, change prompts to bust
cache, wait beyond frozen snapshot expiry, or use admin credentials. It reports
same-frozen-input equality separately from uncached replay; the latter requires
explicit `cached:false` on both attempts. Missing seed support is visible as a
requested/effective seed mismatch. Snapshot/checkpoint drift never passes replay.
Actual awareness GPU process counter deltas are retained but explicitly not
request-attributed dispatch proof. Absent per-request counters remain
NOT_ESTABLISHED. These are measured API limitations, not requests for a contract.

Offline tests: `node --test evaluations/maxcore-fused/*.test.mjs`.
The legacy reviewed-contract runner below remains available for stricter future
instrumentation, but is not needed for the prepared live command.

This is evaluation-only, not training material. Existing `evaluations/maxcore-quality`
cases remain untouched and their byte hashes are pinned in every snapshot. Never
train, tune, ingest into retrieval, or optimize prompts against either frozen set.
New briefs are deliberately fictional, not production user records.

## Client platform targets

The held-out text matrix contains one fictional brief for each of the eight
platform cards on the client Social Media page: Facebook, Instagram, X, YouTube,
TikTok, LinkedIn, Threads, and Google Business. Each canonical card ID is sent
unchanged to the public text endpoint. The frozen source pins include the client
card list, status ID list, platform-optimization registry, and local release
manifest. Before generation, the serving API's checkpoint digest must exactly
match the manifest's checkpoint digest. Audio and video cases are separate
modality probes, not substitutes for any platform target.

## Execution and provenance

Run offline tests with `node --test evaluations/maxcore-fused/runner.test.mjs`.
The CLI defaults to no network. First freeze a reviewed contract:

```
node scripts/evaluate-maxcore-fused.mjs freeze path/to/reviewed-contract.json
node scripts/evaluate-maxcore-fused.mjs validate reports/maxcore-fused/snapshot.json
```

Only after the parent confirms API readiness and authorizes generation:

```
MAXCORE_FUSED_PARENT_READY=yes MAXCORE_FUSED_ALLOW_GENERATION=yes \
node scripts/evaluate-maxcore-fused.mjs live reports/maxcore-fused/snapshot.json
```

Use `MAXCORE_FUSED_BASE_URL`, `E2E_SESSION_COOKIE` (ordinary authenticated test
user session), and `E2E_CSRF_TOKEN` where the application requires it. Obtain these
through normal login; no service/admin keys, auth exemptions, identity overrides,
private user records, paid external generation, publishing or scheduling. The
runner never prints credentials, cookies, server bodies or exception text.
Readiness is GET only; no model reload, training, worker restart or configuration.
Live traffic is serial, at most 14 generation calls (two identical submissions per
case), each bounded to 30 seconds and 2 MiB. No retries or unbounded polling.
Async/incomplete generation is explicitly not established, never a success.

## Reviewed contract

The JSON contract must contain `readinessPath`, `modelHash` (SHA256 of actual
checkpoint, not its name), `sourceRevision`, and `sourceFiles` (repository-relative
implementation/provenance files, each byte-hashed when frozen).
`awarenessSnapshot` contains only reviewed fictional `sources`, `directives`,
and a stable `cacheIdentity`. Include actual source timestamps/provenance in
sources. No production awareness feed or user profile data.
`routes` maps all seven case IDs to `{path, body, fields}`. Body is the exact
ordinary full-pipeline API request including seed, prompt and frozen awareness
snapshot; no direct Python handler calls or replacement kernels. Field mappings
are dotted response paths for `modelHash`, `awarenessHash`, `cacheIdentity`,
`seed`, `output`, `refusal`, `fallback`, `awarenessDispatches`, `gpuDispatches`.
Counters must be request-scoped actual execution deltas, not process totals or
declared device labels. These mappings intentionally require parent confirmation
of the settled API; missing instrumentation is a blocker, not fabricated proof.
`output` must select semantic output without timestamps/job IDs. For actual media
it must include content hashes, not merely a mutable URL. The contract is
reviewed input, never inferred from an untrusted response.

## Acceptance gates

Each response must report the exact frozen awareness hash, seed, checkpoint hash
and cache identity. Full-pipeline evidence requires positive awareness dispatch
and GPU dispatch deltas and explicit `fallback: false`. Missing telemetry is
NOT_ESTABLISHED. Explicit refusal is REFUSED; silent template/model substitution
is FAILED. A cached replay is reported separately and does not establish a second
GPU execution. Exact canonical output equality across identical requests is a
replay gate, not proof of novelty or quality.

Two independent reviewers inspect anonymized outputs and case criteria, scoring
coherence, factual grounding, directives and novelty 1–5 with cited evidence.
Accept each dimension only with both scores >=4, no invented facts and no violated
hard directive. Record disagreements and adjudication, no automated generic score.
Novelty means non-template, meaningfully distinct expression, not random noise.
For scene specs review feasibility/timing; never count a spec as a clip.

For actual music/video, retain authorized fictional artifacts separately, SHA256
hash bytes, decode the whole file with ffmpeg (`-v error -i FILE -f null -`) and
record ffprobe streams/duration/frame counts. Accept duration within 0.25s of four
seconds; audio must be audible, unclipped, match instruments and contain no vocals.
Video requires multiple decoded frames; both reviewers inspect beginning/middle/end
and continuous playback for subject identity, motion, geometry, position and no
cuts/text. Metadata, URLs, queued jobs or scene specs cannot pass decoded-media or
temporal-consistency gates. Runner marks these human/media gates NOT_ESTABLISHED;
it deliberately does not turn inference telemetry into a quality verdict.

## External comparison

Veo comparison is always NOT_ESTABLISHED in this runner. A separate authorized
study requires actual paired external rendered clips for the identical frozen
brief/duration, provider/model/version/request provenance and artifact hashes,
anonymized randomized A/B ordering, two independent blinded reviewers, rubric
scores, disagreements, sample sizes, paired win/tie/loss counts and uncertainty.
No paid calls are implemented. Generic generated scores, heuristic “Veo 100”,
specifications or unpaired outputs are not competitor quality evidence. Seven
cases are a diagnostic sample, never grounds for general superiority claims.