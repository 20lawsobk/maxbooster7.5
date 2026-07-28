# API Reference

All API routes are prefixed `/api/`. The server runs on port 5000.

## Authentication

Most endpoints require an authenticated session or JWT Bearer token. See [AUTH.md](AUTH.md) for the full auth model.

- **Session:** Cookie-based (`express-session`). Include credentials on all requests.
- **JWT:** `Authorization: Bearer <token>` header as fallback.
- **CSRF:** State-changing requests (POST/PUT/PATCH/DELETE) require the `X-CSRF-Token` header matching the `csrf-token` cookie value.
- **Admin:** Routes marked 🔒 require `role === 'admin'`.
- **Public:** Routes marked 🌐 require no auth.

---

## Auth Routes (`/api/auth/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/auth/csrf` | None | Returns CSRF token and sets cookie |
| POST | `/api/auth/login` | None | Email+password login; returns session |
| POST | `/api/auth/register` | None | Create account; returns session |
| POST | `/api/auth/logout` | Session | Destroys session |
| POST | `/api/auth/refresh` | Session | Refreshes JWT/session |
| POST | `/api/auth/forgot-password` | None | Sends password reset email |
| POST | `/api/auth/reset-password` | Token | Resets password via token |
| POST | `/api/auth/2fa/enable` | Session | Initiates 2FA enrollment |
| POST | `/api/auth/2fa/verify` | Session | Verifies 2FA code; sets `twoFactorVerified` |
| POST | `/api/auth/2fa/disable` | Session+2FA | Removes 2FA from account |
| GET | `/api/auth/me` | Session | Returns current user profile |

---

## User / Profile Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/user/preferences` | Session | Fetch UI/accessibility preferences |
| PUT | `/api/user/preferences` | Session | Update preferences |
| DELETE | `/api/user/preferences` | Session | Reset preferences to defaults |
| GET | `/api/artist-profiles` | Session | List artist profiles |
| GET | `/api/artist-profiles/:id` | Session | Single artist profile |
| POST | `/api/artist-profiles` | Session | Create artist profile |
| PUT | `/api/artist-profiles/:id` | Session | Update artist profile |
| GET | `/api/artist-progress` | Session | Career progress metrics |
| GET | `/api/shortcuts` | Session | Keyboard shortcut config |
| PUT | `/api/shortcuts` | Session | Update shortcut bindings |

---

## Beat Marketplace

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/beats` | 🌐 | List marketplace beat listings |
| GET | `/api/beats/:id` | 🌐 | Single beat detail |
| POST | `/api/beats` | Session | Create a beat listing |
| PUT | `/api/beats/:id` | Session | Update own beat listing |
| DELETE | `/api/beats/:id` | Session | Remove own beat listing |
| GET | `/api/beats/trending` | 🌐 | Trending beats |
| POST | `/api/beats/:id/purchase` | Session | Purchase a beat |

---

## Distribution (`/api/distribution/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/distribution/releases` | Session | Artist's DSP releases |
| POST | `/api/distribution/releases` | Session | Create a new release |
| PUT | `/api/distribution/releases/:id` | Session | Update release metadata |
| DELETE | `/api/distribution/releases/:id` | Session | Remove release |
| GET | `/api/distribution/releases/:id/tracks` | Session | Tracks for a release |
| POST | `/api/distribution/releases/:id/tracks` | Session | Add track to release |
| GET | `/api/distribution/providers` | Session | Available DSP providers |
| POST | `/api/distribution/releases/:id/submit` | Session | Submit release to DSPs |
| GET | `/api/distribution/analytics` | Session | Streaming analytics |

---

## Social Media (`/api/social/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/social/accounts` | Session | Connected platform accounts |
| POST | `/api/social/accounts/connect` | Session | OAuth connect a platform |
| DELETE | `/api/social/accounts/:platform` | Session | Disconnect a platform |
| GET | `/api/social/posts` | Session | Scheduled + published posts |
| POST | `/api/social/posts` | Session | Schedule a post |
| PUT | `/api/social/posts/:id` | Session | Update scheduled post |
| DELETE | `/api/social/posts/:id` | Session | Cancel scheduled post |
| GET | `/api/social/calendar` | Session | Calendar view of posts |
| GET | `/api/social/analytics` | Session | Engagement/reach analytics |
| GET | `/api/social/autopilot` | Session | Autopilot config |
| PUT | `/api/social/autopilot` | Session | Update autopilot config |
| POST | `/api/social/autopilot/run` | Session | Trigger an autopilot cycle |

---

## AI Content Generation (`/api/content/`, `/api/ai/`)

All AI generation routes require MaxCore to be reachable. Returns `503` with `AIUnavailableError` when MaxCore is down.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/content/generate-unified` | Session | Unified content generator (social/ad/blog) |
| POST | `/api/content/creative-model` | Session | Advanced creative AI model |
| GET | `/api/ai/health` | Session | MaxCore reachability check |
| POST | `/api/ai/forecast` | Session | AI revenue/trend forecasting |
| GET | `/api/ai/trends` | Session | Music trend insights |
| GET | `/api/ai/models` | Session | Available AI model list |

### MaxCore Proxy (`/api/generate/`, `/api/platform/`, `/api/analyze/`)

These routes are transparent proxies to the external MaxCore AI server:

| Path | MaxCore endpoint | Description |
|---|---|---|
| `/api/generate/content` | `/api/generate/content` | Text/lyric/caption generation |
| `/api/generate/image` | `/api/generate/image` | AI image (renders as typographic art) |
| `/api/platform/video/generate` | `/api/platform/video/generate` | Beat ad video (async, returns `job_id`) |
| `/api/analyze/*` | `/api/analyze/*` | Audio/content analysis |

---

## Advertising (`/api/advertising/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/advertising/campaigns` | Session | List ad campaigns |
| POST | `/api/advertising/campaigns` | Session | Create campaign |
| PUT | `/api/advertising/campaigns/:id` | Session | Update campaign |
| POST | `/api/advertising/campaigns/:id/activate` | Session | Activate campaign (requires `draft` status) |
| GET | `/api/advertising/campaigns/:id/metrics` | Session | Campaign performance metrics |
| GET | `/api/advertising/insights` | Session | Cross-campaign insights |

---

## Billing (`/api/billing/`, `/api/paid/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/billing/plans` | 🌐 | Available subscription plans |
| POST | `/api/billing/subscribe` | Session | Subscribe to a plan (Stripe) |
| GET | `/api/billing/invoices` | Session | Invoice history |
| POST | `/api/billing/checkout` | Session | Create Stripe Checkout session |
| POST | `/api/billing/portal` | Session | Stripe customer portal |
| POST | `/api/webhooks/stripe` | Stripe sig | Stripe event webhook |

---

## Admin Routes (`/api/admin/`) 🔒

All require `role === 'admin'`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/dashboard` | System health overview |
| GET | `/api/admin/users` | All users (paginated) |
| GET | `/api/admin/users/export` | CSV export of users |
| GET | `/api/admin/users/:id` | Single user detail |
| PUT | `/api/admin/users/:id` | Update user (role, ban, etc.) |
| POST | `/api/admin/users/:id/email` | Send email to user |
| DELETE | `/api/admin/users/:id` | Delete user account |
| GET | `/api/admin/analytics` | Platform-wide analytics |
| GET | `/api/admin/settings` | Platform settings |
| PUT | `/api/admin/settings` | Update platform settings |
| GET | `/api/admin/activity` | Recent admin activity log |
| GET | `/api/admin/metrics` | Infrastructure metrics |
| GET | `/api/admin/system-health` | Service health checks |
| GET | `/api/admin/moderation/reports` | User reports queue |
| POST | `/api/admin/moderation/:id/action` | Take moderation action |
| GET | `/api/admin/beat-money-loop/status` | Beat Loop status |
| POST | `/api/admin/beat-money-loop/enable` | Enable Beat Loop |
| POST | `/api/admin/beat-money-loop/disable` | Disable Beat Loop |
| POST | `/api/admin/beat-money-loop/run-now` | Trigger a cycle immediately |
| GET | `/api/admin/beat-money-loop/cycles` | Cycle history |
| GET | `/api/admin/intelligence/status` | AI system intelligence |
| GET | `/api/admin/intelligence/insights` | AI-generated insights |
| GET | `/api/admin/intelligence/security` | Security analytics |

---

## Developer API Keys (`/api/apikeys/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/apikeys/` | Session | List own API keys |
| POST | `/api/apikeys/` | Session | Create new API key |
| DELETE | `/api/apikeys/:keyId` | Session | Revoke API key |

---

## Misc / Utility

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/notifications` | Session | Fetch notifications |
| POST | `/api/notifications/push-key` | Session | VAPID public key for push |
| POST | `/api/notifications/push-subscriptions` | Session | Register push subscription |
| GET | `/api/undo/history` | Session | Undo/redo stack |
| POST | `/api/undo/undo` | Session | Undo last action |
| POST | `/api/undo/redo` | Session | Redo action |
| POST | `/api/batch` | Session | Batch multiple API calls in one request |
| GET | `/api/collaboration/:id` | Session | Collaboration session state |
| GET | `/api/achievements` | Session | User achievements |
| GET | `/api/achievements/leaderboard` | 🌐 | Public leaderboard |

---

## Error Responses

All errors follow a consistent JSON shape:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_CODE",       // optional
  "details": {}                 // optional, validation errors etc.
}
```

| HTTP Status | Meaning |
|---|---|
| 400 | Validation error — check `details` field |
| 401 | Unauthenticated — login required |
| 403 | Forbidden — wrong role, 2FA required, or CSRF mismatch |
| 404 | Resource not found |
| 409 | Conflict (duplicate, already exists) |
| 429 | Rate limited |
| 503 | MaxCore / external dependency unavailable (`AIUnavailableError`) |
| 500 | Unexpected server error |
