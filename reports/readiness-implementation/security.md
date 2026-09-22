# Security implementation — current integrated status

Application remained stopped. No provider/DB queries, migration execution, secrets inspection, dependency installation or workflows were performed. This report supersedes the initial helper-only handoff: the owner subsequently authorized the shared auth slice, and the security worker has now wired those consumers.

## Status by audit ID

| ID | Status | Actual implementation and remaining gate |
|---|---|---|
| SEC-01 | Implemented source chain; migration/deployment verification pending | Durable uncached generation authority, mandatory pre-hydration HTTP validation, cookie issuance and signed JWT access + refresh epoch validation, atomic password change/reset + epoch mutation, force logout. Local login captures epoch before credential reread and never upgrades an in-flight old login to a new epoch. Existing JWT JTI versus database ID mismatch fixed. Final source inspection confirms sibling billing repair and data-owner store validation/confirmed revocation integration. Migration not applied. |
| SEC-02 | Implemented auth/MFA chain; deployment/browser regression gate | Both auth middleware families gate assurance; result-object truthiness consumers replaced with actual `.valid` verification plus durable replay consumption. Pending factor setup/verify handlers are mounted with rate limits; replacement requires current factor and recent reauthentication; active factor survives unverified setup. Google callback requires verified email/provider ID, rejects conflicting linked identity, creates challenge-only session without userId, redirects to a real CSRF-protected challenge form. Real TOTP proof rotates/promotes session at captured epoch. Fresh user hydration refuses incomplete enabled-factor sessions. Signed MFA JWT claim and persisted refresh-token assurance propagate verified factors; JWT request assurance is marked internally, never borrowed from a cookie. |
| SEC-03 | Implemented and wired | Actual custom-workflow webhook consumer uses DNS-address-pinned HTTPS client. Rejects any internal/reserved answer (including mixed answers), credential URLs/non-443, mapped/transition IPv6; no redirects/proxy environment/pooling/body buffering. Bounded ten-second deadline and 256 KiB request body, explicit non-2xx failure. Mocked DNS/socket chain tests verify pinning and no redirect dispatch. Real TLS/egress verification remains release gate. |
| SEC-04 | Partial; durable request boundary wired, erasure policy genuinely blocked | Public DELETE now mounts dedicated authenticated erasure router: password or recent completed OAuth+MFA proof; request and revocation recorded atomically; response HTTP 202 explicitly `erased:false`, pending retention review. GET status and POST cancel endpoints mounted. No worker or completed erasure is claimed. Retention/object/provider inventory and financial/legal-hold policy remain unresolved. Legacy AccountDeletionService must not be activated as a worker; its row deletion is not a complete saga. |
| SEC-05 | Implemented by main owner; preserved | CSRF import/registration is mandatory in index; no catch-and-continue. Security worker inserted only pre-hydration session validation in the authorized session setup slice and preserved mandatory CSRF and removed Google email logs. |
| SEC-06 | Deployment verification gate (outside SEC1–5 implementation scope) | Deployed proxy/cookies, credential custody, real negative authorization/browser tests and secret rotation evidence remain required. |

## Real consumer wiring

### Final governance/admin seams (now wired)

Immediately after `app.use(attachUser)`, routes mounts `getApplicationContainment().guard` then `governanceBoundary`. The index owner must configure the existing singleton before `registerRoutes` (no silent local instance/fallback is created). Maintenance calls the existing `enforceMaintenance` service; exact method/path recovery exclusions cover liveness/readiness, app-shell/login resources, login/logout/password recovery, factor challenge/setup/verify/disable/status and session heartbeat. No client header grants admin recovery. Stripe and SendGrid webhook exemptions require existing cryptographic verification first, not just matching path/header; lookalike subpaths remain governed. The configured actual mount paths are `/api/webhooks/stripe` and `/webhooks/sendgrid`. SendGrid additionally requires preserved raw body and a timestamp within five minutes. Provider handlers still perform their own verification; deployed provider signature/raw-body compatibility remains an integration test requirement.

`assertRegistrationEnabled()` now precedes each authorized local/demo/Google new-account creation. Main's billing-owned new-account path also contains its own assertion on final source inspection. Existing-account login is not registration.

Legacy `/api/auth/token` and `/api/auth/token/revoke` now use **the same** `issueAdminApiToken`/`revokeAdminApiToken` hashed own-account developer-key service as `/api/admin/tokens`, after `requireAdmin` and `require2FA`. Issue returns 201/no-store; revoke validates nonempty ≤100-character `tokenId` and actor ownership. No delegated admin/session tokens or weaker header-based privilege were introduced.

- `server/index.ts`: immediately after `app.use(session(sessionConfig))`, import/mount `validateSessionAuthority`; invalid/missing epochs reject and authority outage returns 503.
- `server/routes.ts`: all four **authorized auth-slice** issuers (registration, password login, demo and Google) set `authGeneration` before save. Password changes and reset token consumption update epoch in the **same Drizzle transaction** as credential mutation. Password change retains precisely the transaction-returned epoch, never a newer unrelated revocation epoch. Old sessions cannot regain validity after a TTL. Two billing-owned post-payment issuer sites outside the authorized slice remain below.
- Local login preserves existing password/TOTP response flow; both otplib result-object truthiness bugs fixed. Token issuance receives verified-session factor state and captured epoch.
- Google callback retains provider, requires verified email/nonempty identity, rejects a different existing linked subject. Enabled MFA redirects to `/api/auth/2fa/challenge`; GET provides accessible HTML form and POST validates actual TOTP plus authority before session rotation. Challenge session contains `pendingMfa`, not `userId`; ordinary raw-user routes cannot authenticate it. CSRF body token remains required; challenge path is not exempt.
- `/api/auth/2fa/setup` and `/verify` invoke `mfaLifecycle(userCacheInvalidate)`; setup stores session-bound ten-minute pending secret, requires five-minute recent reauth and current factor for replacement. Verify promotes after proof, revokes old generations, retains current verified session. Disable revokes and clears pending/verified factor state.
- `server/auth.ts` and `middleware/auth.ts` consume internal verified-JWT assurance or same-identity verified cookie assurance. MFA-bearing JWTs are **implemented**, not blanket denied. Only authenticated server callsites can pass proof into issuer; access token signature/database JTI/epoch/current user checks precede internal request mark. Refresh tokens preserve assurance in their persisted opaque value and do not mint a new epoch on rotation.
- `/api/auth/account` old row-delete route replaced by erasure router mount. Middleware is path-scoped so it cannot block Google/other auth endpoints. Fresh verified OAuth callbacks/challenge completion stamp recent reauthentication, providing real OAuth account-request proof.

## Migration — NOT applied

`migrations/0020_security_authority.sql`:

- `auth_session_epochs(user_id, generation)` references users; existing users schema has no compatible durable tokenVersion field.
- Final migration adds `last_totp_step` and `last_totp_secret_hash` to that same authority table (no second replay table). Every active-factor proof consumes its watermark atomically, shared across pods/entrypoints. User-row lock prevents a stale old-factor proof overwriting a newly promoted factor's watermark; promotion initializes the new factor watermark in the same statement as factor change/epoch bump.
- `account_erasure_requests` intentionally survives eventual user deletion, contains no email/token, and records pending-policy/cancelled/processing/completed states without claiming processing exists.

Operator must apply through approved migration process to shared DB before release. Schema owner must declare both tables before any schema-push operation to avoid removal of unmanaged tables. Old cookies/access/refresh tokens without generations require sign-in again. SQL execution, transaction contention/deadlock and rollout/rollback testing remain pending; no live schema was touched.

## Data-owner integration contract (implemented by data owner; source verified)

Final read-only inspection confirms `AuthoritativeSessionStore.get` imports authority and validates `data.authGeneration` before callback, and `sessionConfig.revokeUserSessions` awaits `authority.revoke(userId)` then returns `{confirmed:true}`. Security worker did not edit these files. Their durable-store tests remain the data owner's evidence; this report's tests do not execute the real database.

`sessionAuthority()` in `server/services/sessionAuthority.ts` resolves:

```ts
issue(userId: string): Promise<string>
validate(userId: string, generation: unknown): Promise<boolean>
revoke(userId: string): Promise<void>
```

All authority failures propagate. No generation is minted on reads, touches or cache misses.

1. Replace `sessionConfig.ts` exported `revokeUserSessions` body with:

```ts
await (await sessionAuthority()).revoke(userId);
```

Import from `../services/sessionAuthority.js`; old PDIM boolean gates must not reject newly issued generations.

2. Current `AuthoritativeSessionStore.get` deserializes PG then invokes callback. Before the final `.then(data => cb(null,data), err => cb(err))`, insert:

```ts
.then(async data => {
  if (!data?.userId) return data;
  return await (await sessionAuthority()).validate(data.userId, data.authGeneration)
    ? data : null;
})
```

Import same service there. Apply equivalently to any alternative active store and passport-style user ID shape supported by the adapter. Error callback must fail closed, never return cached data. Preserve durable set/destroy callbacks. HTTP middleware is already wired as defense in depth; this adapter check is still needed for websocket/direct-store consumers. The security worker did not edit sessionConfig or any store adapter.

## Genuine remaining integration/policy gates

- **Billing-owned issuer handoff resolved in source:** final inspection confirms existing checkout customer branch returns 409 requiring normal login instead of auto-authenticating by email; new-account branch stamps generation/recent proof before save, strips factor/reset/verification secrets from response and checks registration policy. Security worker did not edit billing lines; billing owner owns their route tests.

- Erasure UI owner must display HTTP 202 queued/not-erased response and status/cancel controls rather than the old “deleted” toast; route response is honest, but the old UI success interpretation is not proof of completion.
- Retention matrix covering financial/contract data/legal holds, all ownership relations including non-FK analytics, object/provider deletion manifest, durable idempotent receipts/retries, cache purge and backup expiration. Do **not** schedule the old destructive row-delete service. No destructive guesses made to satisfy erasure promises.
- **Provider-owner finding from exemption inspection:** existing `emailTrackingService.verifySendGridSignature` uses NaCl Ed25519, while SendGrid signed event webhooks use ECDSA. This pre-existing provider verifier is outside the owned auth slice; the maintenance boundary deliberately does not bypass its failed signature. Provider owner must replace that verifier with SHA-256/ECDSA verification using the documented SendGrid public-key format and preserve raw bytes through `/webhooks/sendgrid` (the downstream handler currently derives raw input from parsed `req.body`). Authentic SendGrid delivery is not certified by our mocked governance test; do not claim this provider integration ready before that repair and fixture test.
- Factor replacement UI must send `currentCode`, handle `requiresReauthentication` and setup expiry. Initial enrollment and local login field/response formats preserved. Google MFA has a functional server-rendered form, but deployed browser/CSP/form-post and accessibility smoke checks remain required.
- Refresh rotation now calls `consumeRefreshToken`, a conditional `UPDATE ... WHERE revoked=false AND expires_at>now() RETURNING id` over existing `refresh_tokens`, binding ID/token/user. Only one concurrent caller can mint successors; actual JWT chain test exercises two simultaneous refreshes with one winner. A subsequent token-persistence failure burns the old token and returns an error rather than reviving it.
- Factor promotion/disable use `factorRepository` compare-and-swap of the proved previous factor plus epoch bump in one SQL statement. All active-factor uses (local login, Google challenge, replacement setup, disable, validate) call durable `consumeTotp`; pending-factor promotion writes its proved time step atomically. Reusing a code in its 30-second period is deliberately rejected, including across different endpoints/pods. Client must instruct waiting for a fresh code.

## Exact client API contract (main/client owner)

All state-changing requests retain existing session cookies and CSRF header; do not bypass CSRF for these paths.

### MFA

- `POST /api/auth/2fa/setup`: first enrollment body `{}`; enabled-factor replacement body `{currentCode:"123456"}`. Both require a password/Google+MFA sign-in completed within five minutes. Missing/stale recent proof returns 403 `{message, requiresReauthentication:true}`; redirect through existing sign-in, then retry with a **new** current authenticator code. Invalid/replayed current code returns 403 with message. Success 200 `{secret, qrCode, otpauthUrl}`; pending secret expires in ten minutes and is bound to this browser session. Existing active factor remains unchanged at setup.
- `POST /api/auth/2fa/verify` body `{code:"123456"}` for the **pending** secret. Success `{success:true,message}` enables/replaces factor, revokes old sessions/tokens, retains this verified session. Expired/missing pending setup or invalid proof: 400; concurrent factor replacement/database failure: explicit error. Do not reuse the enrollment code immediately for another operation; wait for the next six-digit code.
- `POST /api/auth/2fa/disable`: local account `{password,code}`; passwordless OAuth account `{code}` after recent completed Google sign-in/MFA. Invalid reauth returns 403 `{requiresReauthentication:true}`; current factor code is required and consumed. Success `{success:true,message}`, clears factor and revokes old credentials.
- `POST /api/auth/2fa/validate` `{code}` returns `{valid:true|false}`, with durable one-use code consumption; authority/persistence outage returns 503. It is not a reusable, side-effect-free code-check endpoint.
- Google callback redirects enabled-factor accounts to real `/api/auth/2fa/challenge` HTML form. Challenge expiry is five minutes, successful proof regenerates session and redirects dashboard. No client-side bypass/promotion request is needed.

### Account erasure requests

- `DELETE /api/auth/account`: local `{password}`; passwordless OAuth `{}` following Google sign-in+MFA within five minutes. Missing reauth: 403 `{requiresReauthentication:true,message}`. Accepted: **202** `{accepted:true, erased:false, request:{user_id,requested_at,not_before,status:"pending_policy"}, message}`. Current session is destroyed; show “erasure requested / awaiting retention review”, never “deleted”. User can sign in again to view/cancel while queued.
- `GET /api/auth/account/erasure` authenticated response `{request:null}` or `{request:{requested_at,not_before,status,completed_at}}`.
- `POST /api/auth/account/erasure/cancel` authenticated body `{}`. Success `{cancelled:true}`; no pending/cancellable request gives 409. After cancellation, a new delete request starts a fresh 30-day not-before date. No claim of completed erasure until policy/worker integration exists.

## Evidence — isolated, no live boundaries

All commands used `env -i PATH="$PATH" HOME=/tmp`.

1. `node_modules/.bin/tsx --test server/services/securityAuthority.test.ts` — **8 passed**:
   legacy generation rejection; offline authority propagation; old/new epoch separation; private/reserved URL/address denial; cookie-vs-signed-token factor identity separation; **real otplib TOTP challenge chain** with invalid/revoked/offline rejection, regeneration, epoch preservation and assurance promotion; erasure request SQL boundary; factor compare-and-swap/atomic epoch SQL boundary; real TOTP replay consumption across concurrent simulated pods and offline denial.
2. `node --test server/services/securityJwtChain.test.mjs` — **4 passed**: actual production JWT module bundled with isolated DB/authority/env/logger boundaries; real JWT signing/verification, real JTI mapping, MFA claim issuance, **concurrent refresh single-winner consumption**, old-epoch rejection and new login success. Also source wiring assertions, actual outbound client DNS/socket-boundary tests (no external network), and maintenance boundary tests for exact recovery paths, fake admin headers, signature-check invocation and lookalike paths.
3. Isolated esbuild transpilation of shared auth/index slice and dedicated changed modules passed. No full tsc/suite; transpilation is not full type checking.

No app startup/screenshots because application is stopped. No SQL execution, provider callbacks, real TLS connections, browser/session-store end-to-end tests or production validation claimed. Release remains gated on migration, retention decisions, client contract acceptance and deployment evidence.