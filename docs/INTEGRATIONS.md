# External Integrations

## MaxCore AI Server

**URL:** `https://secure-ai-forge.replit.app`  
**Config:** `AI_SERVER_URL` env var (default: above)  
**Auth:** `Authorization: Bearer <MAXCORE_API_KEY>` — **never** `X-API-Key` or `X-Admin-Key` (those 401)  
**Client:** `server/services/maxcore.ts` + `server/routes/maxcoreProxy.ts`

MaxCore is the external AI backbone. All AI features are gated behind `requireMaxCore` middleware — when MaxCore is unreachable, endpoints return `503 AIUnavailableError` immediately rather than timing out.

### Available Endpoints

| MaxCore Path | Method | Purpose | Notes |
|---|---|---|---|
| `/api/generate/content` | POST | Text/lyric/caption/social copy | Sync |
| `/api/generate/image` | POST | AI image (typographic art) | Sync; image IS the rendered prompt |
| `/api/platform/video/generate` | POST | Beat ad video | Sync; returns scene-script |
| `/api/platform/audio-job` | POST | Async beat audio generation | Returns `job_id` |
| `/api/platform/audio-job/:id` | GET | Poll async audio job | 202 while pending, 200 with URL on complete |
| `/api/analyze/*` | POST | Audio/content analysis | |
| `/api/health` | GET | Reachability probe | 404 but server is up |
| `/api/viral-score` | POST | Content virality prediction | |
| `/api/safety` | POST | Content safety check | |
| `/api/distribution` | POST | Distribution analysis | |

### Stability Notes

- MaxCore cold-starts take 1–5 minutes from idle.
- Hard-crashes ~30s under sustained render load (GPU memory on the MaxCore Repl).
- Keep-alive pings do not prevent the crash; fix must be on the MaxCore Repl.
- `pingMaxcore()` should be used for health checks, not generation endpoints.
- Circuit breaker + bulkhead in `callMaxcore()` fast-fails when MaxCore is known-down.
- 45s proxy timeout configured for long-running jobs.

### Image Generation Note
`/api/generate/image` renders the composed prompt as **typographic art** — the text IS the artwork. Send clean, short hook copy only. No field suppresses the typography. Discover schema via 422 responses.

---

## PDIM (Pocket Dimension)

**Purpose:** Redis-compatible high-throughput session store and job bus  
**Config:** `STORAGE_HTTP_URL`, `STORAGE_BEARER_TOKEN` (current); `PDIM_HTTP_URL`, `PDIM_BEARER_TOKEN` (legacy — reconciled in `pdimEnvFix.ts`)  
**Client:** `server/services/pdimService.ts`

PDIM is the L2 session store (between in-process L1 Map and PostgreSQL fallback) and the primary fast-path for session cross-pod revocation.

### Concurrency model
- AIMD adaptive concurrency: additive increase on success, multiplicative decrease on 429.
- Passive geometric decay toward floor (not traffic-driven) prevents workers pinning at 429 ceiling.
- Timeouts call `_pdimAdaptTimeout()` NOT `_pdimAdapt429()` (the latter pins `_last429At` and blocks passive decay permanently).
- High-volume callers have L1 in-process cache to avoid hammering PDIM.
- Direct chain split into N round-robin lanes for parallel throughput.

---

## Stripe

**Purpose:** Subscription billing, one-time purchases, marketplace payouts  
**Config:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`  
**Client:** `server/routes/billing.ts`, `server/routes/webhooks/stripe.ts`

### Flows
- **Subscriptions:** Checkout Session → Stripe-hosted page → `customer.subscription.created` webhook → update `users.subscriptionStatus`.
- **Beat purchases:** Payment Intent → confirm on client → `payment_intent.succeeded` webhook → create `orders` row.
- **Payouts:** Stripe Connect (artist accounts) → `payout.paid` webhook → update royalty records.
- **Webhook validation:** `stripe.webhooks.constructEvent()` with raw body — never parse body before verification.

### Customer portal
`POST /api/billing/portal` creates a Stripe Customer Portal session. Users manage their own subscriptions there.

---

## SendGrid

**Purpose:** Transactional email (password reset, notifications, receipts)  
**Config:** `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`  
**Inbound webhook:** `POST /api/webhooks/sendgrid`

### Email types
- Password reset: template ID configured in settings.
- Welcome email: triggered on first login.
- Beat sale receipt: to seller and buyer.
- Admin alerts: system health issues.

---

## Twilio (SMS/Verify)

**Purpose:** 2FA OTP via SMS  
**Config:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`

### 2FA flow
1. `POST /api/auth/2fa/enable` — starts verification: Twilio sends SMS.
2. `POST /api/auth/2fa/verify` — checks via `verificationChecks.create()` (Twilio owns the code, not us).
3. On success: `user.twoFactorEnabled = true`, `session.twoFactorVerified = true`.

> Never store the OTP code locally. Confirm via `verificationChecks`, not a local comparison.

---

## Social OAuth Platforms

All social OAuth uses Passport.js strategies. Tokens are encrypted before storage in `socialAccounts`.

| Platform | Strategy | Scopes needed | Token lifetime |
|---|---|---|---|
| Instagram | `passport-instagram` / Meta Graph | `instagram_basic`, `pages_show_list`, `instagram_content_publish` | 60 days (long-lived) |
| TikTok | `passport-tiktok` | `user.info.basic`, `video.upload`, `video.publish` | Short; refresh required |
| X (Twitter) | `passport-twitter` / OAuth 2.0 | `tweet.read`, `tweet.write`, `users.read` | App-only or user |
| Facebook | `passport-facebook` | `pages_manage_posts`, `pages_read_engagement` | 60 days |
| YouTube | `passport-google-oauth20` | `youtube.upload`, `youtube.readonly` | Access + refresh |
| Spotify | `passport-spotify` | `user-read-email`, `user-library-read` | 1 hour; auto-refresh |
| SoundCloud | `passport-soundcloud` | `non-expiring` | Long-lived |

### Token refresh
`socialMediaService.ts` refreshes tokens before each API call. Persistent failures set `socialAccounts.status = "error"` and notify the user.

### Spotify oEmbed
Uses native `fetch` with hardcoded oEmbed URL — not the `safeFetchText` axios agent (which fails for Spotify TLS: `ERR_INVALID_IP_ADDRESS`).

---

## Custom Domain / DNS

**Purpose:** Artist subdomains (`*.max-booster.com`) routing to storefronts  
**Worker:** `cf-subdomain-worker.js` (Cloudflare Worker)

### Flow
```
Browser: https://b-lawzmusic.max-booster.com/
→ Cloudflare Worker (wildcard route *.max-booster.com/*)
  → Validates hostname against HOST_RE allow-list
  → Rewrites hostname to max-booster.com
  → Sets X-Forwarded-Host: b-lawzmusic.max-booster.com
  → Applies HSTS + CSP security headers
→ Replit origin (Express)
  → multiTenantRouter reads X-Forwarded-Host
  → Queries storefront_hosts WHERE hostname = 'b-lawzmusic.max-booster.com'
  → Routes to matching storefront
```

**Required:** Every active subdomain must have a row in `storefront_hosts` with `active = true`.

### DNS management
`server/routes/dnsManager.ts` + `server/services/storefrontDnsService.ts` handle:
- Adding/removing DNS records via configured providers (Cloudflare API, etc.).
- Domain verification tokens.
- Health checks for custom domains.

---

## Redis / BullMQ

**Purpose:** Job queues for background processing  
**Config:** `REDIS_URL` (default: `localhost:6379`)  
**Started by:** `redis-server --daemonize yes --port 6379 --loglevel warning` (in run command)

### Queues
- `content-generation` — AI content jobs
- `distribution` — DSP submission jobs
- `email` — SendGrid delivery jobs
- `analytics` — data aggregation jobs
- `beat-loop` — Beat Money Loop cycles

Each queue has a corresponding Worker in `server/workers/`. Workers must have cron types registered before starting, or scheduled jobs silently stop running.

---

## Replit Environment

The app is deployed on Replit Autoscale. Key platform details:

- **Database:** `DATABASE_URL` (Replit-managed PostgreSQL) is a different DB from `NEON_DATABASE_URL` (app DB). All schema/query work targets `NEON_DATABASE_URL`.
- **Secrets:** All API keys/tokens stored as Replit Secrets (shared environment).
- **Domain:** Dev URL via `$REPLIT_DEV_DOMAIN`; never hardcode `localhost` in app code.
- **Preview proxy:** mTLS proxied iframe — use relative URLs in app code.
- **`tar` package:** Blocked by Replit firewall. Local stub at `stubs/tar/` with `overrides.tar = "file:./stubs/tar"` in `package.json`.
