# Current live platform verification — 2026-09-19

## Scope and runtime

A single workspace-driven Chromium pass used the normal existing-admin login (HTTP 200, landing on `/dashboard`). Credentials remained in the workspace environment; no credential, cookie, token, or account payload is recorded. The app liveness endpoint was available, and the supervised Python MaxCore health response was HTTP 200 with `status: healthy`, `warm_start.state: warm`, and `model_loaded: true`.

The browser pass was read-only: it did not change preferences, cart state, projects, releases, or other user data. No payment, publishing, distribution, provider, or destructive action was invoked. Screenshot account areas are redacted.

## Browser results

| View | Mounted evidence | Browser-observed HTTP errors | Screenshot |
|---|---|---|---|
| Dashboard `/dashboard` | Dashboard heading and dashboard content rendered | `GET /api/ai/insights` returned **503** | [dashboard.png](screenshots/platform-live-current/dashboard.png) |
| Social `/social-media` | Social Media Management, platform connections, and main tabs rendered | None observed | [social.png](screenshots/platform-live-current/social.png) |
| Distribution `/distribution` | Music Distribution summary, release metrics, and distribution tabs rendered | None observed | [distribution.png](screenshots/platform-live-current/distribution.png) |
| QC `/distribution#qc` | Activated the real QC tab with pointer input; **Automated Quality Control** rendered | None observed | [qc.png](screenshots/platform-live-current/qc.png) |
| Marketplace `/marketplace` | Marketplace catalog view rendered | None observed | [marketplace.png](screenshots/platform-live-current/marketplace.png) |
| Studio `/studio` | Studio route and shell mounted, but the capture remained in its loading-skeleton state | None observed during the capture window | [studio.png](screenshots/platform-live-current/studio.png) |
| Settings `/settings` | Settings page content rendered | None observed | [settings.png](screenshots/platform-live-current/settings.png) |
| Analytics `/analytics` | Analytics page content rendered | None observed | [analytics.png](screenshots/platform-live-current/analytics.png) |

No uncaught JavaScript exception was observed during the pass. A mounted page does not certify every control or downstream provider. In particular, this pass did **not** establish that the Studio progressed from its loading shell to an interactive project, and dashboard AI insights were explicitly unavailable at HTTP 503.

## Authenticated safe GET checks

All responses below were JSON and owner-authenticated:

| Endpoint | HTTP | Shape assertion |
|---|---:|---|
| `/api/dashboard/comprehensive` | 200 | object |
| `/api/social/platform-status` | 200 | object |
| `/api/distribution/releases` | 200 | array or `releases` array envelope |
| `/api/distribution/qc` | 200 | object |
| `/api/marketplace/beats` | 200 | catalog array/envelope |
| `/api/projects` | 200 | `data` array envelope |
| `/api/auth/preferences` | 200 | object |
| `/api/analytics/dashboard` | 200 | object |

The owner-scoped QC lookup for the deliberately nonexistent release ID returned JSON **404** with `error: "Release not found"`. This is the registered QC route's domain response, not an HTML or generic missing-route response.

## Live awareness and generation checks

### URL-based social generation

An authenticated request to `/api/social/generate-from-url` used:

- URL `https://example.com`
- Instagram, inspirational tone, text format
- distinctive structured `intent`, `direction`, `context`, and `awareness` objects

The endpoint accepted the payload and returned HTTP 200 with `success: true`, platform `instagram`, source `MaxCoreAI`, source URL `https://example.com`, and no failed platforms.

However, the output quality exposed a real defect: instead of following the distinctive **SIGNAL LANTERN 47** direction, the hook/caption began with the malformed fragment `{"audienceAction"` and included a literal `DIRECTION` fragment. The distinctive signal was absent from this URL result.

### Direct MaxCore social text generation

The same structured context was sent directly to MaxCore's authenticated `/api/platform/social/generate` seam with a distinctive Signal Lantern topic and instruction. It returned HTTP 200, `success: true`, platform `instagram`, one variant, and source `awareness`. The caption contained **Signal Lantern 47**, but it again began with `{"audienceAction"` and included literal `DIRECTION`.

This proves that the live endpoint accepts the structured payload and returns a sourced generation result. It does **not** prove correct interpretation of every structured field: the leaked object-key fragment indicates faulty structured intent/direction normalization or prompt serialization. Because “Signal Lantern 47” was also present in the topic/instruction, its presence alone cannot prove that the black-box model consumed each awareness field.

## Current failures and limits

1. **Structured awareness generation defect:** structured objects leak malformed JSON-like key fragments into both URL-based and direct social output. URL generation also ignored the distinctive requested phrase.
2. **Dashboard AI insights unavailable:** browser-observed `GET /api/ai/insights` returned HTTP 503.
3. **Studio readiness unproven:** only its mounted loading skeleton was captured.
4. This verification does not claim every media model consumes awareness from black-box output. Exact seam behavior belongs in separate focused unit tests.
5. Connected-platform cards and distribution catalog claims were rendered, but no provider delivery or mutation was attempted, so external operational outcomes remain unverified.

## Post-fix HTTP re-verification — 2026-09-19

This focused follow-up did not rerun the browser. It waited for the app route and for MaxCore to report healthy, warm, and model-loaded, then repeated the exact previously failing structured URL-social and direct-social payloads through normal authenticated HTTP. It stopped after the single attempt because one required assertion still failed.

### Resolved

- Neither new output contained raw JSON keys, braces, the prior `{"audienceAction"` fragment, nor the literal `DIRECTION` fragment.
- URL generation returned HTTP 200, `success: true`, source `MaxCoreAI`, and no failed platforms. Its caption now opened with the coherent awareness phrase **“AWARENESS BEACON 47 prioritizes intentional listening over passive scrolling!”**
- Direct MaxCore social generation returned HTTP 200, `success: true`, source `awareness`, and one variant.
- `GET /api/studio/start-hub/summary` returned HTTP 200 JSON in **213 ms**, within the 60-second bound. Its shape included project arrays, song summary/count data, aggregate project statistics, templates, and tips. No user values were retained. This resolves the earlier screenshot-only uncertainty about the Studio start-hub backend, although it does not retroactively prove that the prior browser skeleton completed rendering.

### Remaining failure

The direct request explicitly instructed MaxCore to **“Open with the exact phrase SIGNAL LANTERN 47”**. The distinctive phrase was present, but the hook instead began:

> the exact phrase SIGNAL LANTERN 47 and invite listeners into one intentional shared listening moment …

Therefore the exact-opening assertion **failed**. The URL payload also did not contain `SIGNAL LANTERN 47` in its output, despite its structured direction containing `mustInclude: SIGNAL LANTERN 47`; that payload had no separate top-level `instruction` field.

The native raw-control leak is no longer reproduced, but instruction adherence is not fully repaired. No retry loop, account change, provider write, or other mutation was performed.

## Final native-composer check — 2026-09-19

After MaxCore reported healthy, warm, and model-loaded, the two previously failing authenticated HTTP payloads were each repeated once. Both checks passed:

- **Direct social:** HTTP 200, `success: true`, source `awareness`. The hook now starts exactly **“SIGNAL LANTERN 47 and invite listeners…”**, does not start with “the exact phrase,” and contains no raw JSON key, brace, `DIRECTION`, or other control-syntax leak.
- **URL social:** HTTP 200, `success: true`, source `MaxCoreAI`, and no failed platforms. The structured direction supplied `mustInclude: SIGNAL LANTERN 47`; the generated caption includes **SIGNAL LANTERN 47** and contains no raw metadata/control-syntax leak.

This closes the two specific runtime regressions tested here. No browser, Studio, account, or provider-write check was repeated.

## Structured social-copy defect: native cause and repair

Focused native review identified three cooperating causes:

1. The shared cascade serialized structured `intent`, `direction`, and `context`
   as JSON on lines adjacent to generic awareness labels. `ScriptAgent`'s
   signal parser correctly skipped the label line but then treated the following
   JSON object as a quotable plain-text content signal.
2. A high-priority instruction such as `Open with SIGNAL LANTERN 47` was
   recognized as coaching, but when no other content signal existed the fallback
   put coaching lines back into the hook candidate pool. That exposed literal
   `DIRECTION`/instruction language instead of applying its semantics.
3. The model garble whitelist included the complete raw awareness envelope.
   Consequently an echoed key such as `{"audienceAction"` could be considered
   known text and escape the normal garble fallback.

The native repair keeps each structured object on a machine-only
`[CONTROL_*]` line. The agent decodes scalar values for model conditioning while
excluding object keys, JSON punctuation, and control labels from both its prompt
and content-signal pools. Explicit opening-phrase direction is applied as an
opening phrase; audience-action intent selects the corresponding native CTA.
Context values remain conditioning context rather than becoming hook/body copy.
Model candidates that copy known control keys or control syntax are rejected as
metadata leakage and routed through the existing awareness composition path;
finished strings are not blanket-scrubbed and no new fake/template fallback was
introduced.

A regression constructs the real `PlatformSocialRequest` from the live-report
payload shape, passes its merged awareness to the real `ScriptAgent`, and uses a
model probe that deliberately emits the prior `{"audienceAction"`/`DIRECTION`
failure. It proves the output opens with `SIGNAL LANTERN 47`, uses the requested
save action, and contains no JSON keys or control labels. It also proves the
model prompt receives the distinctive intent/direction/context values but not
their transport keys or syntax.

Focused native result:

```text
python3 -m pytest -q \
  tests/test_native_awareness_cascade.py \
  tests/test_social_generation_controls.py \
  tests/test_platform_awareness_wiring.py \
  tests/test_social_ad_beacon.py

25 passed, 2 pre-existing FastAPI deprecation warnings
```

Python compilation passed for the changed native files. This report update does
not claim a post-restart live result; the owning agent must restart the main
workflow and repeat the cheap direct HTTP flow before marking the live defect
closed. Max knowledge-assistant source remains unchanged and exempt.

## Exact-direction follow-up

The first post-fix live retest exposed two narrower semantic defects:

- `Open with the exact phrase SIGNAL LANTERN 47` was parsed by the generic
  `with (.+)` rule, so the composer treated **“the exact phrase”** as part of the
  requested literal.
- Structured `direction.mustInclude` values were available as model guidance,
  but the native awareness composer did not enforce them as literal inclusion
  constraints. The URL flow, which had no top-level `instruction`, could
  therefore omit `SIGNAL LANTERN 47`.

The native parser now recognizes “with the exact phrase …” and quoted exact
phrases, extracting only the requested phrase. The composer also reads
`mustInclude` (plus equivalent required/include phrase keys, including nested
lists) and inserts each missing literal into the composed body. This happens at
composition time; there is no marker-specific hardcoding, fake prefix, or
general finished-output scrub. Exact opening constraints are checked with
`startswith`, so a phrase appearing later cannot incorrectly satisfy “open
with.”

Real-agent regressions use independent phrases (`ORBIT GLASS 82`,
`VELVET COMET 19`, `COPPER ECHO 63`, `NORTH STAR CASSETTE`, and
`ROOM 28 SESSION`). They cover the user's wording “the exact phrase,” a quoted
variant, and one-/multi-value `mustInclude` lists through real
`PlatformSocialRequest` parsing and `ScriptAgent` composition.

Final affected native suites:

```text
python3 -m pytest -q \
  tests/test_native_awareness_cascade.py \
  tests/test_social_generation_controls.py \
  tests/test_platform_awareness_wiring.py \
  tests/test_social_ad_beacon.py

29 passed, 2 pre-existing FastAPI deprecation warnings
```

No workflow restart or live request was performed for this follow-up; the owning
agent performs the cheap live check.