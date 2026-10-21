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

## Page wiring and regression checks

The [generation page inventory](../reports/readiness-implementation/generation-page-wiring.md)
maps all 80 route declarations to generation references. Static import closure
over-approximates shared barrel imports and does not prove that every imported
component renders. Earlier browser acceptance covered all 80 route cases;
this is route/render evidence, not certification of every business journey.

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
