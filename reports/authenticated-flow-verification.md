# Authenticated flow verification — 2026-09-18

## Outcome

One workspace-driven headless Chromium pass completed through the normal login flow using workspace-only E2E credentials. No credentials, cookies, tokens, or preference payloads are recorded here; account-identifying areas are redacted from the screenshots. All three requested flows passed. No application defect was found.

## Evidence

### Social text analysis

- Opened Social Media, activated the outer **Autopilot** tab and then the inner **Text** tab with CDP pointer events.
- Submitted: “Authenticated workspace analysis renders measured text facts.”
- The pre-armed `POST /api/content-analysis/text` observation received HTTP 200.
- The mounted result displayed **MaxCore native analysis**, **Text**, the deterministic Unicode-tokenization method, 61 characters, 7 words, 7 unique case-folded words, 1 sentence, 1 paragraph, keyword/ngram tables, readability values, lexical-sentiment measurements, observed-token measurements, and explicit limitations.
- Screenshot: [social-text-analysis.png](screenshots/authenticated-flow/social-text-analysis.png)

### Marketplace cart persistence

- Original cart count was 0.
- A real pointer click added one marketplace license; the cart count became 1.
- After a full page reload, the cart count remained 1.
- Opened the cart and removed the item with a real pointer click; the count returned to 0.
- The final persisted cart storage matched the exact original state. No checkout or purchase control was used.
- Screenshots: [marketplace-cart-added.png](screenshots/authenticated-flow/marketplace-cart-added.png), [marketplace-cart-removed.png](screenshots/authenticated-flow/marketplace-cart-removed.png)

### Settings preferences hydration

- The page's `GET /api/auth/preferences` returned HTTP 200.
- Rendered controls matched the corresponding response values:
  - theme `light` → **Light**
  - default BPM `120` → **120**
  - default key `C` → **C Major**
  - auto-save `true` → **checked**
  - beta features `true` → **checked**
- Reloaded the page, reactivated **Preferences** with a real pointer click, and observed another HTTP 200 GET. All five rendered values were unchanged and still matched.
- No preference control was changed and no save action was invoked.
- Screenshots: [settings-preferences.png](screenshots/authenticated-flow/settings-preferences.png), [settings-preferences-reloaded.png](screenshots/authenticated-flow/settings-preferences-reloaded.png)

## Failures and scope

- Application failures observed: **none**.
- The normal login request returned HTTP 200 and reached `/dashboard`.
- Real UI dismissal was attempted for consent/survey overlays. The consent banner remained visible but non-blocking in some captures; it did not intercept any tested pointer action. This is a remaining harness-evidence limitation, not an observed failure of the three tested flows.
- The social URL flow was intentionally excluded from the browser pass because its repair was in progress; it was verified later by the focused HTTP follow-up below.
- No auth bypass, account provisioning, access change, payment, purchase, publishing, distribution, or preference write was performed.

## Social URL follow-up — 2026-09-18

A focused live HTTP follow-up ran after the application routes were registered and the supervised Python MaxCore `/api/health` reported `healthy`. It used the normal CSRF-protected login with workspace-only credentials; no secret, cookie, token, or account response data was retained.

- `POST /api/social/generate-from-url` with `https://example.com`, platform `instagram`, tone `energetic`, and format `text` returned HTTP 200 with `success: true`.
- The sole generated item had platform `instagram`, format `text`, source `MaxCoreAI`, source URL `https://example.com`, and no failed platforms.
- The returned caption was source-grounded in **Example Domain**, included the requested URL, and contained generated Instagram copy and a call to action. The response's optional `extractedTitle` field was `null`; this did not prevent the source-grounded caption or successful MaxCore result.
- The same authenticated endpoint rejected `http://127.0.0.1:8090/api/health` with HTTP 400 and `URL resolves to a restricted network range`.
- No paid or provider side-effect action was invoked.