# Authentication & Authorization

## Overview

Max Booster uses a multi-layer authentication system combining sessions, JWTs, OAuth, 2FA, and CSRF protection. Every mechanism falls back gracefully to the next so no single point of failure locks users out.

---

## Authentication Layers

### 1. Session Authentication (primary)

Sessions are managed by `express-session` with a custom `PdimSessionStore`:

```
Request → L1 in-process Map (5,000 entries, sub-ms) 
       → PDIM Redis-compatible store (cross-pod persistence)
       → PostgreSQL pg_sessions table (PDIM outage fallback)
```

- Session cookies use `SameSite=Strict` and are `httpOnly`.
- `SESSION_SECRET` (min 32 chars) is required — set as a Replit Secret.
- Cross-pod revocation: `isRevoked(userId)` checks a `session:revoke:{uid}` flag in PDIM. Propagation lag is capped at 5 seconds by asymmetric L1 TTLs.

### 2. JWT Fallback

When no valid session is found, `requireAuthDual` (`server/auth.ts`) falls back to JWT:

- `jwtAuthService` verifies tokens against `SESSION_SECRET`.
- Tokens carry a `ver` (version) claim. Incrementing `user.tokenVersion` in the DB invalidates all existing JWTs for that user instantly.
- Brute-force guard: `recordJwtFailure` blocks IPs after 30 failures per 15 minutes.

### 3. Replit OIDC (OAuth SSO)

`server/replitAuth.ts` handles Replit-hosted OAuth for dev/internal users:
- PKCE flow, JWKS key rotation, token refresh.
- Maps Replit identity to local `users` row; creates account on first login.

### 4. Social OAuth

Passportjs strategies for Instagram, TikTok, Spotify, YouTube, Facebook, X (Twitter), SoundCloud. Tokens stored encrypted in `socialAccounts` table; refreshed automatically before API calls.

---

## Middleware Stack (per authenticated request)

```
1. PlatformFixerMiddleware     — tracks 5xx rate for auto-remediation
2. express-session             — populates req.session from L1/PDIM/PG
3. Origin validation           — checks SameSite=Lax + Origin header
4. CSRF middleware             — double-submit cookie validation
5. Demo write guard            — restricts demo@maxbooster.ai to safe paths
6. Global rate limiter         — Redis-backed, scalable
7. Admission control           — concurrency gate
8. requireAuth                 — resolves user via session or JWT; enforces trial/sub expiry
9. [optional] require2FA       — checks session.twoFactorVerified
10.[optional] requireAdmin     — checks user.role === 'admin'
11.[optional] subscription gate — checks user plan for feature access
```

---

## CSRF Protection

Implemented as a double-submit cookie pattern (`server/middleware/csrf.ts`):

1. On any GET to `/api/auth/csrf` (or automatically on session hydration), server sets a `csrf-token` cookie (`SameSite=Strict`, `httpOnly: false` so JS can read it).
2. All state-changing methods (POST/PUT/DELETE/PATCH) must send the **same value** in the `X-CSRF-Token` request header.
3. Server validates cookie value === header value.

**CSRF exemptions:**
- Stripe/SendGrid webhook endpoints
- Auth entry points (`/api/auth/login`, `/api/auth/register`)
- Internal server-to-server calls using `BOOSTERSTATE_SECRET`

**Testing CSRF with curl:**
```bash
# 1. Get session + CSRF token
TOKEN=$(curl -sc /tmp/cookies https://app/api/auth/login -d '...' | jq -r '.csrfToken')
# OR read cookie directly:
TOKEN=$(grep csrf-token /tmp/cookies | awk '{print $NF}')

# 2. Use on mutations
curl -b /tmp/cookies -H "X-CSRF-Token: $TOKEN" -X POST https://app/api/...
```

---

## Two-Factor Authentication (2FA)

- Provider: **Twilio Verify** (owns the OTP code; never stored locally).
- Flow: User enables 2FA → phone verified via `verificationChecks` API.
- Middleware `require2FA` checks `user.twoFactorEnabled && !req.session.twoFactorVerified`.
- Returns `403 { requiresTwoFactor: true }` if unverified.
- Dev-only bypass: `devCode` env var (non-production only).

---

## Role-Based Access Control

| Role | Access |
|---|---|
| `user` | Own resources only |
| `admin` | All resources + admin routes |
| `demo` | Read-only (blocked from mutations by `blockDemoWrite`) |

Admin gate: `requireAdmin` middleware checks `req.user.role === 'admin'`. Client-side: `useRequireAdmin` hook self-gates each admin page component (Sidebar `adminOnly` flag only hides nav links — it is not a security boundary).

---

## Key Files

| File | Purpose |
|---|---|
| `server/auth.ts` | `requireAuth`, `requireAuthDual`, `requireAdmin`, `blockDemoWrite` |
| `server/middleware/auth.ts` | `require2FA`, per-request role checks |
| `server/middleware/csrf.ts` | CSRF token generation and validation |
| `server/middleware/sessionConfig.ts` | `PdimSessionStore` (L1→PDIM→PG) |
| `server/services/jwtAuthService.ts` | JWT sign/verify/revoke/brute-force guard |
| `server/replitAuth.ts` | Replit OIDC PKCE flow |
| `server/storage.ts` | `createJWTToken`, `verifyJWTToken`, `revokeJWTToken`, session CRUD |

---

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `SESSION_SECRET` | ✅ | Min 32 chars — set as Replit Secret |
| `REPLIT_OIDC_*` | Dev only | Auto-provided in Replit environment |
| `TWILIO_ACCOUNT_SID` | For 2FA | |
| `TWILIO_AUTH_TOKEN` | For 2FA | |
| `TWILIO_VERIFY_SERVICE_SID` | For 2FA | |
| `BOOSTERSTATE_SECRET` | Internal | Shared secret for sidecar server-to-server calls |
