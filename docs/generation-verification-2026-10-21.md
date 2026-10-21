# Generation and deployment verification — 2026-10-21

This change connects the canonical, fresh public-awareness snapshot to main
generation requests, including text, image, audio and video aliases. Caller
context remains separate from the server snapshot and authenticated ownership.
The awareness endpoint and the model-independent planner work without trained
weights. A plan is explicitly a specification, not finished copy or media.

## Verified capability boundaries

| Output | Working implementation and evidence | Remaining limit |
| --- | --- | --- |
| Text | Fresh awareness and planner HTTP responses; main generation propagates the same canonical context. | The measured live generator returns 503 because no current public-trained candidate passes the unchanged capability checks. Live data alone does not establish fluent text generation. |
| Image | Explicit typographic poster controls produce a decoded PNG. Dedicated generation HTTP handlers validate bytes and durable receipts. Social/advertising image delivery decodes, saves under the authenticated owner and verifies read-back. | Arbitrary illustrated subjects and learned styles are not verified. A poster is an explicitly selected option. |
| Audio | Explicit piano/synth/bass/drum/ensemble controls produce a decoded PCM WAV. Studio/service requests propagate tempo, instrument and ownership; bounded job polling resolves actual owned files. | Vocal generation, reference imitation and exact learned note performance are not established. |
| Video | Explicit single-scene solid/gradient headline controls produce a decoded MP4. Music-video consumers use the actual job-status endpoint, bounded polling and terminal failure handling. | Arbitrary cinematic scenes and learned text-to-video are not established. |

The Python HTTP regression uses a filesystem-backed durable-delivery fixture;
it does not certify the deployed PDIM/Neon storage journey. Actual engine probes
decode PNG, WAV and MP4 outputs. Browser tests exercise the real React renderer's
submit, error, retry, preview, callback and unmount cancellation using receipt
fixtures. They do not replace deployed end-to-end acceptance.

After restarting the integrated local workspace, health and live awareness
returned 200 with 14 healthy public sources. The canonical context and planner
returned 200; the actual main-client text request returned a redacted 503 in
178 ms. The model reported
`no_operationally_capable_certified_public_live_candidate`. This is a measured
generation limitation, not a missing hosted-model API key.

## Page wiring and regression checks

The [generation page inventory](../reports/readiness-implementation/generation-page-wiring.md)
maps all 80 route declarations to generation references. Static import closure
over-approximates shared barrel imports and does not prove that every imported
component renders. Fresh browser acceptance against integrated application
application revision `d648e6e7` passed all 80 route cases: 42 authenticated, 11 administrator
and 27 public. The runner uses disposable PostgreSQL, a synthetic account and
real password/session/TOTP boundaries. It preserves saved-data journeys for
preferences, projects, workspace ownership and the press kit, honors throttling,
and removes its fixture state. This is route/render evidence, not certification
of every business journey.
The [per-page acceptance results](../reports/readiness-implementation/generation-page-acceptance.json)
record each scenario, redirect, hydration result and fixture-content assertion.

Focused checks include `generated-image-delivery`, `local-media-renderer-contract`,
`multimodal-media-workers`, `main-generation-awareness-http`,
`awareness-proxy-independence`, `maxcore-audio-job-owner`,
`audio-generation-service-contract`, `studio-audio-submit-http`,
`music-video-job-delivery` and `videoJobPolling`. The real browser contract runs
with `node --test tests/local-media-renderer-browser.test.mjs`.

Run `npm run check`, `npm run lint`, `npm run test:ci`, imported API-server
`npm run typecheck`, and Python generation/planner/dedicated-media regression tests
on an integrated revision. Release preparation and cold startup must be repeated
after source changes; an older prepared payload does not verify a newer tree.

Historical checks at integration revision `a8a3c6ca` (the follow-up checks are recorded below):

| Check | Actual result |
| --- | --- |
| Root `test:ci` | Exit 0; 2,328 Vitest tests, zero failures/errors, plus runtime and Sharp security contracts. |
| Root server/client types; imported API types | Passed. |
| Root quiet lint; production build | Passed; quiet lint establishes no errors, not zero warnings. |
| Python generation/planner/dedicated-media regressions | 77 tests and 34 subtests passed; 16 lifecycle deprecation warnings. |
| Browser/deployment contract batch | 26 passed, including real renderer submit/retry/preview/cancellation. |
| Production dependency audit | Zero reported vulnerabilities after updating Vite to 7.3.7 and follow-redirects to 1.16.1 across the applicable dependency trees. |
| Installed dependency gate | Passed; 91 physical package occurrences checked, including imported subsystems. |
| HTTP dependency consumers | Five passed, including actual cross-host redirects that strip array/object authorization and cookie headers and a custom sensitive header containing a regex metacharacter. |
| Offline payment runner | 73 contract tests and 14 SQL/production-handler tests passed; one remote Stripe test skipped because this invocation deliberately has no provider credentials. |

## Deployment status

The Replit configuration and [deployment instructions](replit-production-deployment.md)
are restored. A GitHub push does not establish Replit synchronization, Nix
evaluation, publishing, or a successful deployed startup.

Whole-product production readiness remains unproven. In addition to the text
and learned-media capability limits above, A&R forecast/timing and direct
calendar publish remain unavailable; provider journeys, live signed Stripe
webhook delivery, and off-host retained recovery remain unverified. The last
read-only live Stripe inventory contained no webhook endpoints. Credentials
alone do not close these gaps. No live charge, external message or public
deployment was performed for this verification.

## Capability, beat loop and Studio follow-up

Operational text checks now explicitly pin one fresh canonical awareness
snapshot across all probe cases. Candidate capability cache identity includes
that receipt and expiry, and warming/expired awareness is not persisted as a
model failure. Current Python regressions pass 111 tests and 43 subtests.
A restarted real workspace again returned awareness/context/planner 200 with
14 healthy public sources; actual main-client content returned 503 in 406 ms
because no candidate passed the unchanged capability gate.

The [beat loop verification](beat-loop-production-verification-2026-10-21.md)
records the generation-to-listing, promotion, settlement, refund and repeat-cycle
repairs and the nine disposable-database lifecycle scenarios. Fixtures do not
establish actual generated quality, external posts or sales.

Studio's real playback engine now processes supported browser inserts in saved
order, retaining per-instance processors and parameter/bypass state. Chromium
renders actual audio through all eight supported effect types; EQ amplitude,
parameter edits, bypass, independent instances, insert order and last-effect
removal are verified. Catalog selection retains the actual processor type and
preset, and a failed saved-project instantiation cannot appear as success.
Native plugin inventory is shown in the same browser; simulated scan results,
claims of a connected native host and unprocessed VST pass-through were removed.

The [Linux VST3 build entry point](../native/vst3/README.md) translates an original
JUCE project's source list, identifiers, resources and module list to CMake.
Its configuration and source-admission tests pass. A Linux binary cannot yet be
built: `VST3/` contains Windows outputs but no original C++ or `.jucer` source.
The supplied Windows binary also lacks a PE export directory. No native DSP
execution or parity is claimed.

`node`, `nodejs`, `npm`, `nix` and `nix-shell` are installed in the cloud workspace
and pass `npm run check:tools`, including actual Nix evaluation and shell
execution. Replit's Nix profile declares these tools and the Linux native-build
dependencies. Syntax parsing passes; complete Replit Nix closure evaluation and
Publishing startup still require verification on that host.

Follow-up validation: root CI passed 2,332 tests with zero failures/errors;
server/client type checks and quiet lint passed. The new beat lifecycle runner
passed all nine scenarios (ten Node test results including its parent harness).
Native configuration/inventory and real Studio audio contracts passed. The
offline payment runner again passed 73 contracts and 14 SQL/handler tests with
one remote Stripe test intentionally skipped; production audit reported zero
vulnerabilities. Provider credentials are not inherited by isolated tests.

The final follow-up also repeated all 80 route scenarios against application
revision `d648e6e7`: 42 authenticated, 11 administrator and 27 public cases,
with no failures and successful fixture cleanup. The updated per-page report
retains the real authentication/TOTP and saved-data journey assertions.

Studio's final save/reopen regression also verifies restoration of processor
type, parameter values and bypass for track and master inserts. Known legacy
plugin slugs resolve to their browser processor when old saved projects lack a
type field. Master inserts process the mixed playback signal and the toolbar's
master-volume control now reaches that same engine. The real audio regression
checks master EQ and master bypass as well as the per-track effect chain.

A subsequently supplied `VST3.zip` could not be inspected: the attachment
transfer tool rejected it for exceeding its 32 MiB limit. The absence of source
in the repository does not establish what is inside that uninspected archive.
A source-only archive within the transfer limit is needed to continue the
native Linux port.
